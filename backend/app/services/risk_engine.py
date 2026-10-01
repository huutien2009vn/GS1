from __future__ import annotations

import math
import statistics
from dataclasses import dataclass
from datetime import datetime, timezone

from ..schemas import (
    AIInsight,
    AlertItem,
    AssessmentCreate,
    AssessmentResult,
    HealthTip,
    ScoreBreakdown,
    Thresholds,
)


CONDITION_WEIGHTS = {
    "hypertension": 1.8,
    "diabetes": 2.0,
    "cardiovascular": 2.4,
    "stroke": 2.5,
}
F1_RELATIONS = {"father", "mother", "sibling"}


def clamp(value: float, minimum: float = 0, maximum: float = 100) -> float:
    return max(minimum, min(maximum, value))


def _ramp(value: float, healthy_low: float, healthy_high: float, hard_low: float, hard_high: float) -> float:
    if healthy_low <= value <= healthy_high:
        return 0.0
    if value < healthy_low:
        return clamp((healthy_low - value) / max(healthy_low - hard_low, 1) * 100)
    return clamp((value - healthy_high) / max(hard_high - healthy_high, 1) * 100)


def calculate_pgrs(payload: AssessmentCreate) -> float:
    """Pedigree Genetic Risk Score; an explainable proxy, not a genomic PRS."""
    burden = 0.0
    unique_close_conditions: set[str] = set()
    for member in payload.family_history:
        relation_factor = 1.0 if member.relation in F1_RELATIONS else 0.55
        for condition in set(member.conditions):
            burden += CONDITION_WEIGHTS[condition] * relation_factor
            if relation_factor == 1.0:
                unique_close_conditions.add(condition)

    # Saturating curve prevents large families from making the score unbounded.
    score = 100 * (1 - math.exp(-burden / 7.5))
    score += max(0, len(unique_close_conditions) - 1) * 3
    return round(clamp(score), 1)


def calculate_brs(payload: AssessmentCreate) -> float:
    profile = payload.profile
    bmi = profile.bmi
    score = 4.0
    score += clamp((profile.age - 30) * 0.72, 0, 38)

    if bmi < 18.5:
        score += min(12, (18.5 - bmi) * 2.5)
    elif bmi >= 25:
        score += min(25, (bmi - 25) * 2.25)

    if profile.smoker:
        score += 18
    if profile.activity_minutes_week < 150:
        score += (150 - profile.activity_minutes_week) / 150 * 14
    score += min(24, len(set(profile.known_conditions)) * 8)
    return round(clamp(score), 1)


def _variation_score(values: list[float]) -> float:
    if len(values) < 3:
        return 0
    mean = statistics.fmean(values)
    if not mean:
        return 0
    coefficient = statistics.pstdev(values) / mean
    return clamp((coefficient - 0.03) * 400, 0, 35)


def calculate_vital_score(payload: AssessmentCreate) -> float:
    v = payload.vitals
    components: list[tuple[float, float]] = []
    if v.heart_rate is not None:
        components.append((_ramp(v.heart_rate, 60, 100, 35, 160), 0.18))
    if v.systolic is not None:
        components.append((_ramp(v.systolic, 90, 129, 65, 190), 0.24))
    if v.diastolic is not None:
        components.append((_ramp(v.diastolic, 60, 84, 40, 120), 0.18))
    if v.spo2 is not None:
        components.append((_ramp(v.spo2, 95, 100, 85, 101), 0.24))
    if v.glucose is not None:
        # Demo assumes mg/dL and does not infer fasting/post-meal state.
        components.append((_ramp(v.glucose, 70, 140, 45, 260), 0.16))

    if not components:
        return 0.0
    weighted = sum(value * weight for value, weight in components) / sum(weight for _, weight in components)

    for field in ("heart_rate", "systolic", "diastolic", "spo2", "glucose"):
        values = [getattr(sample, field) for sample in payload.samples if getattr(sample, field) is not None]
        weighted += _variation_score(values) * 0.1
    return round(clamp(weighted), 1)


def _build_alerts(payload: AssessmentCreate) -> list[AlertItem]:
    v = payload.vitals
    alerts: list[AlertItem] = []

    def add(metric: str, severity: str, message: str) -> None:
        alerts.append(AlertItem(metric=metric, severity=severity, message=message))

    if v.spo2 is not None:
        if v.spo2 < 90:
            add("SpO₂", "alert", "SpO₂ dưới 90%. Hãy đo lại ngay; nếu kèm khó thở, cần hỗ trợ y tế khẩn cấp.")
        elif v.spo2 < 95:
            add("SpO₂", "attention", "SpO₂ thấp hơn khoảng theo dõi thông thường; nghỉ yên và đo lại.")
    if v.systolic is not None and v.diastolic is not None:
        if v.systolic >= 180 or v.diastolic >= 120:
            add("Huyết áp", "alert", "Chỉ số ở vùng rất cao. Đo lại sau 5 phút và liên hệ cấp cứu nếu có triệu chứng bất thường.")
        elif v.systolic >= 140 or v.diastolic >= 90:
            add("Huyết áp", "attention", "Huyết áp cao; nên ghi lại và trao đổi với nhân viên y tế.")
    if v.heart_rate is not None:
        if v.heart_rate < 40 or v.heart_rate > 150:
            add("Nhịp tim", "alert", "Nhịp tim nằm ngoài vùng an toàn; nghỉ yên và đánh giá triệu chứng.")
        elif v.heart_rate < 50 or v.heart_rate > 110:
            add("Nhịp tim", "attention", "Nhịp tim khác vùng nghỉ thường gặp; đo lại khi cơ thể ổn định.")
    if v.glucose is not None:
        if v.glucose < 54 or v.glucose > 300:
            add("Đường huyết", "alert", "Đường huyết ở mức cần xử trí sớm theo kế hoạch của bác sĩ.")
        elif v.glucose < 70 or v.glucose > 180:
            add("Đường huyết", "attention", "Đường huyết cần chú ý; đối chiếu thời điểm ăn và hướng dẫn điều trị cá nhân.")
    if not alerts:
        add("Tổng quan", "safe", "Các chỉ số vừa nhận chưa chạm ngưỡng cảnh báo.")
    return alerts


def _rule_tips(payload: AssessmentCreate, level: str, alerts: list[AlertItem]) -> AIInsight:
    tips: list[HealthTip] = []
    profile = payload.profile
    v = payload.vitals
    family = {condition for member in payload.family_history for condition in member.conditions}
    known = set(profile.known_conditions)

    def tip(priority: str, title: str, action: str, reason: str) -> None:
        tips.append(HealthTip(title=title, action=action, reason=reason, priority=priority))

    def fmt(value: float) -> str:
        return f"{value:g}".replace(".", ",")

    # Tips from this reading's values come first; each reason quotes the number that triggered it.
    if v.systolic is not None and v.diastolic is not None:
        reading = f"{fmt(v.systolic)}/{fmt(v.diastolic)} mmHg"
        if v.systolic >= 180 or v.diastolic >= 120:
            tip("high", "Nghỉ rồi đo lại huyết áp", "Ngồi yên 5 phút, chân đặt sàn, tay ngang tim rồi đo lại. Nếu vẫn rất cao, liên hệ bác sĩ ngay trong hôm nay.",
                f"Huyết áp lần này là {reading}, ở vùng rất cao (từ 180/120).")
        elif v.systolic >= 140 or v.diastolic >= 90:
            tip("high", "Đo huyết áp đúng tư thế", "Ngồi nghỉ 5 phút, chân đặt sàn, tay ngang tim rồi đo 2 lần, cách nhau 1 phút.",
                f"Huyết áp lần này là {reading}, cao hơn ngưỡng 140/90.")
            tip("medium", "Ăn nhạt hơn", "Giảm nước mắm, muối, mì gói và đồ muối chua; nêm nhạt dần trong 2 tuần.",
                "Giảm muối giúp hạ huyết áp ở nhiều người.")
        elif "hypertension" in known:
            tip("low", "Giữ nhịp đo huyết áp", "Đo vào cùng giờ mỗi ngày và uống thuốc đúng theo đơn của bác sĩ.",
                f"Bạn đã khai báo tăng huyết áp; lần này là {reading}, trong ngưỡng theo dõi.")
        elif family & {"hypertension", "stroke", "cardiovascular"}:
            tip("low", "Đo huyết áp định kỳ", "Đo ít nhất 1 lần mỗi tuần và ghi lại, kể cả khi thấy khỏe.",
                f"Gia đình có tiền sử tim mạch hoặc huyết áp; lần này là {reading}.")
    elif "hypertension" in known or family & {"hypertension", "stroke", "cardiovascular"}:
        tip("medium", "Đo huyết áp trong lần tới", "Lần ghi chỉ số tiếp theo, hãy đo cả huyết áp.",
            "Hồ sơ của bạn có yếu tố tim mạch hoặc huyết áp nhưng lần này chưa đo huyết áp.")

    if v.glucose is not None:
        reading = f"{fmt(v.glucose)} mg/dL"
        if v.glucose < 70:
            tip("high", "Xử trí khi đường huyết thấp", "Ăn hoặc uống thứ có đường (nửa cốc nước trái cây hoặc 3 viên kẹo), nghỉ 15 phút rồi đo lại. Liên hệ bác sĩ nếu không cải thiện.",
                f"Đường huyết lần này là {reading}, thấp hơn 70.")
        elif v.glucose > 180:
            tip("high", "Ghi rõ thời điểm đo đường huyết", "Đánh dấu trước ăn, sau ăn hay khi có triệu chứng, và mang số liệu đến lần khám tới.",
                f"Đường huyết lần này là {reading}, cao hơn 180.")
            tip("medium", "Giảm đồ ngọt và tinh bột trắng", "Thay nước ngọt bằng nước lọc; ăn rau trước, cơm sau và bớt nửa bát cơm mỗi bữa.",
                "Lượng đường và tinh bột trong bữa ăn ảnh hưởng trực tiếp đến đường huyết.")
    elif "diabetes" in known or "diabetes" in family:
        tip("medium", "Đo đường huyết trong lần tới", "Nếu có máy đo, hãy ghi thêm đường huyết lúc đói.",
            "Hồ sơ của bạn hoặc gia đình có đái tháo đường nhưng lần này chưa đo đường huyết.")

    if v.spo2 is not None and v.spo2 < 95:
        tip("high", "Đo lại SpO₂ khi tay ấm", "Ngồi yên, làm ấm ngón tay, bỏ sơn móng nếu có rồi đo lại sau vài phút. Nếu khó thở, gọi cấp cứu.",
            f"SpO₂ lần này là {fmt(v.spo2)}%, thấp hơn 95%.")

    if v.heart_rate is not None and (v.heart_rate > 110 or v.heart_rate < 50):
        direction = "nhanh hơn 110" if v.heart_rate > 110 else "chậm hơn 50"
        tip("high", "Đo lại nhịp tim khi đã nghỉ", "Ngồi nghỉ 10 phút, tránh cà phê và trà đặc trước khi đo lại.",
            f"Nhịp tim lần này là {fmt(v.heart_rate)} lần/phút, {direction}.")

    # Tips from the profile.
    if profile.smoker:
        tip("high", "Lập kế hoạch bỏ thuốc", "Chọn một ngày bắt đầu và tìm hỗ trợ từ bác sĩ hoặc chương trình cai thuốc.",
            "Hút thuốc làm tăng rủi ro tim mạch có thể thay đổi được.")
    if profile.activity_minutes_week < 150:
        missing = 150 - profile.activity_minutes_week
        tip("medium", "Tăng vận động từ từ", "Thêm 10 đến 15 phút đi bộ nhanh vào 5 ngày mỗi tuần.",
            f"Bạn đang vận động {profile.activity_minutes_week} phút mỗi tuần, còn thiếu {missing} phút so với mức khuyến nghị 150.")
    if profile.bmi >= 23:
        tip("medium", "Theo dõi cân nặng theo tuần", "Ưu tiên khẩu phần nhiều rau, đạm nạc và giảm đồ uống có đường.",
            f"BMI của bạn là {fmt(round(profile.bmi, 1))}, cao hơn mức 23 khuyến nghị cho người châu Á.")
    elif profile.bmi < 18.5:
        tip("medium", "Ăn đủ bữa, đủ chất", "Thêm một bữa phụ có đạm (sữa, trứng, đậu) mỗi ngày và cân lại sau 2 tuần.",
            f"BMI của bạn là {fmt(round(profile.bmi, 1))}, thấp hơn 18,5.")

    if not tips:
        tip("low", "Duy trì nhịp theo dõi", "Đo cùng thời điểm và cùng điều kiện trong các ngày tiếp theo.",
            "Các chỉ số và hồ sơ hiện chưa có điểm cần lưu ý; xu hướng nhiều ngày hữu ích hơn một lần đo.")
    tips.sort(key=lambda item: {"high": 0, "medium": 1, "low": 2}[item.priority])

    follow_up = {
        "safe": "Tiếp tục thói quen lành mạnh và theo dõi định kỳ.",
        "attention": "Nên đo lại trong điều kiện nghỉ ngơi và đặt lịch tư vấn nếu chỉ số lặp lại.",
        "alert": "Ưu tiên đánh giá triệu chứng và tìm hỗ trợ y tế ngay khi có đau ngực, khó thở, lú lẫn hoặc yếu liệt.",
    }[level]
    return AIInsight(
        summary={"safe": "Các chỉ số đã cung cấp chưa chạm ngưỡng cảnh báo. Hãy tiếp tục theo dõi đều đặn.",
                 "attention": "Có yếu tố cần chú ý. Hãy xem hướng dẫn bên dưới và đo lại khi đã nghỉ ngơi.",
                 "alert": "Có dấu hiệu cần được kiểm tra sớm. Ưu tiên đọc cảnh báo và tìm hỗ trợ y tế khi cần."}[level],
        explanations=["Điểm là công cụ sàng lọc minh họa, không phải chẩn đoán.", "Xu hướng và bối cảnh đo quan trọng hơn một giá trị đơn lẻ."],
        tips=tips[:4],
        follow_up=follow_up,
        source="rules",
    )


@dataclass
class RiskCalculation:
    result: AssessmentResult
    pgrs: float
    brs: float
    vitals: float


def calculate_risk(payload: AssessmentCreate) -> RiskCalculation:
    pgrs = calculate_pgrs(payload)
    brs = calculate_brs(payload)
    vitals = calculate_vital_score(payload)

    # Multiplicative three-layer fusion. Each layer amplifies the others.
    multiplicative = ((1 + pgrs / 100) * (1 + brs / 100) * (1 + vitals / 100) - 1) / 7 * 100
    overall = round(clamp(multiplicative), 1)

    attention_threshold = round(max(22, 40 - pgrs * 0.12), 1)
    alert_threshold = round(max(45, 70 - pgrs * 0.16), 1)
    alerts = _build_alerts(payload)
    emergency_override = any(alert.severity == "alert" for alert in alerts)

    if emergency_override or overall >= alert_threshold:
        level = "alert"
    elif overall >= attention_threshold or any(alert.severity == "attention" for alert in alerts):
        level = "attention"
    else:
        level = "safe"

    insight = _rule_tips(payload, level, alerts)
    result = AssessmentResult(
        created_at=datetime.now(timezone.utc),
        risk_level=level,
        scores=ScoreBreakdown(pgrs=pgrs, brs=brs, vitals=vitals, overall=overall),
        thresholds=Thresholds(attention=attention_threshold, alert=alert_threshold),
        alerts=alerts,
        insight=insight,
        disclaimer="Chỉ dùng để tham khảo và hỗ trợ theo dõi, không thay thế chẩn đoán hoặc xử trí của nhân viên y tế.",
    )
    return RiskCalculation(result=result, pgrs=pgrs, brs=brs, vitals=vitals)
