import json

from backend.app.services.ai_service import (
    MEDICAL_DOCUMENT_SCHEMA,
    _gemini_schema,
    _medical_analysis_from_json,
)


def test_gemini_schema_uses_cross_model_compatible_subset():
    schema = _gemini_schema(MEDICAL_DOCUMENT_SCHEMA)
    assert schema["properties"]["document_date"]["type"] == "string"

    serialized = json.dumps(schema)
    for fragile_keyword in ("additionalProperties", "minItems", "maxItems", "minLength", "maxLength", "pattern"):
        assert fragile_keyword not in serialized


def test_medical_output_normalizes_unknown_date_and_empty_copy():
    output = json.dumps({
        "document_type": "other",
        "document_date": "",
        "provider": "",
        "title": "",
        "summary": "",
        "metrics": [],
        "conditions": [],
        "medications": [],
        "recommendations": [],
        "warnings": [],
        "confidence": "low",
        "review_required": False,
        "source": "ai",
        "disclaimer": "",
    })

    analysis = _medical_analysis_from_json(output)
    assert analysis.document_date is None
    assert analysis.title == "Tài liệu sức khỏe cần xem lại"
    assert analysis.review_required is True
    assert analysis.disclaimer
