from backend.app.schemas import AssessmentCreate, FamilyHistoryInput
from backend.app.services.risk_engine import calculate_pgrs, calculate_risk


def make_payload(**vitals):
    return AssessmentCreate.model_validate(
        {
            "profile": {
                "age": 38,
                "sex": "female",
                "height_cm": 162,
                "weight_kg": 58,
                "smoker": False,
                "activity_minutes_week": 180,
                "known_conditions": [],
            },
            "family_history": [],
            "vitals": {"heart_rate": 72, "systolic": 118, "diastolic": 76, "spo2": 98, "glucose": 105} | vitals,
            "samples": [],
        }
    )


def test_healthy_payload_is_safe():
    result = calculate_risk(make_payload()).result
    assert result.risk_level == "safe"
    assert result.scores.overall < result.thresholds.attention


def test_emergency_vital_overrides_combined_score():
    result = calculate_risk(make_payload(spo2=86)).result
    assert result.risk_level == "alert"
    assert any(alert.metric == "SpO₂" and alert.severity == "alert" for alert in result.alerts)


def test_close_family_history_has_higher_pgrs_than_grandparent():
    close = make_payload()
    close.family_history = [FamilyHistoryInput(relation="father", conditions=["cardiovascular"])]
    distant = make_payload()
    distant.family_history = [FamilyHistoryInput(relation="grandfather", conditions=["cardiovascular"])]
    assert calculate_pgrs(close) > calculate_pgrs(distant)


def test_high_pgrs_lowers_alert_threshold():
    baseline = calculate_risk(make_payload()).result
    payload = make_payload()
    payload.family_history = [
        FamilyHistoryInput(relation="father", conditions=["hypertension", "diabetes", "cardiovascular"]),
        FamilyHistoryInput(relation="mother", conditions=["hypertension", "stroke"]),
    ]
    elevated = calculate_risk(payload).result
    assert elevated.thresholds.alert < baseline.thresholds.alert


def test_tips_quote_the_reading_that_triggered_them():
    titles = lambda result: [tip.title for tip in result.insight.tips]
    healthy = calculate_risk(make_payload()).result
    assert titles(healthy) == ["Duy trì nhịp theo dõi"]

    high_bp = calculate_risk(make_payload(systolic=152, diastolic=96)).result
    assert titles(high_bp)[:2] == ["Đo huyết áp đúng tư thế", "Ăn nhạt hơn"]
    assert "152/96 mmHg" in high_bp.insight.tips[0].reason

    low_spo2 = calculate_risk(make_payload(spo2=93.5)).result
    assert "93,5%" in low_spo2.insight.tips[0].reason

    low_glucose = calculate_risk(make_payload(glucose=62)).result
    assert titles(low_glucose)[0] == "Xử trí khi đường huyết thấp"


def test_tips_use_family_history_when_a_vital_is_missing():
    payload = make_payload(glucose=None)
    payload.family_history = [FamilyHistoryInput(relation="mother", conditions=["diabetes"], knowledge="known")]
    result = calculate_risk(payload).result
    assert "Đo đường huyết trong lần tới" in [tip.title for tip in result.insight.tips]


def _account(family, known=()):
    from backend.app.schemas import AccountProfile
    return AccountProfile.model_validate({
        "display_name": "Test", "health_consent": True,
        "profile": {"age": 40, "sex": "male", "height_cm": 170, "weight_kg": 60, "activity_minutes_week": 150,
                    "known_conditions": list(known)},
        "family_history": family,
    })


def _member(member_id, relation, side, conditions=(), knowledge=None, count=1):
    return {"member_id": member_id, "relation": relation, "side": side, "conditions": list(conditions),
            "knowledge": knowledge or ("known" if conditions else "none"), "affected_count": count}


def test_family_risk_levels_follow_closeness_and_number_of_relatives():
    from backend.app.services.risk_engine import family_risk, risk_overview
    family = [
        _member("father", "father", "immediate", ["hypertension", "diabetes"]),
        _member("mother", "mother", "immediate", ["hypertension"]),
        _member("sibling", "sibling", "immediate", ["dyslipidemia"], count=2),
        _member("paternal-grandfather", "grandfather", "paternal", ["diabetes", "stroke"]),
        _member("paternal-grandmother", "grandmother", "paternal", ["colorectal_cancer"]),
        _member("maternal-grandfather", "grandfather", "maternal", ["colorectal_cancer"]),
        _member("maternal-grandmother", "grandmother", "maternal"),
    ]
    levels = {row["condition"]: row for row in family_risk(_account(family, known=["stroke"]))}
    assert levels["hypertension"]["level"] == "very_high"       # both parents
    assert levels["diabetes"]["level"] == "very_high"           # a parent and a grandparent
    assert levels["dyslipidemia"]["level"] == "very_high"       # two siblings
    assert levels["colorectal_cancer"]["level"] == "moderate"   # one grandparent on each side
    assert levels["stroke"]["level"] == "diagnosed"             # already in the person's own profile
    assert levels["breast_cancer"]["level"] == "none" and not levels["breast_cancer"]["advice"]
    assert levels["diabetes"]["relatives"] == ["father", "paternal-grandfather"] and levels["diabetes"]["advice"]
    # One parent alone is "high"; an unknown parent is not the same as a clean history.
    alone = [_member("father", "father", "immediate", ["diabetes"]), _member("mother", "mother", "immediate", knowledge="unknown"),
             _member("sibling", "sibling", "immediate")]
    alone_levels = {row["condition"]: row["level"] for row in family_risk(_account(alone))}
    assert alone_levels["diabetes"] == "high" and alone_levels["stroke"] == "unknown"
    overview = risk_overview(_account(alone), None)
    assert overview["relatives_unknown"] == 1 and overview["scores"]["overall"] is None and overview["scores"]["pgrs"] > 0
    # Cancers never move the cardiometabolic score.
    cancer_only = [_member("mother", "mother", "immediate", ["breast_cancer"])]
    assert risk_overview(_account(cancer_only), 0.0)["scores"]["pgrs"] == 0
