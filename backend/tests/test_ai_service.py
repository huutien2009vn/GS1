import asyncio
import json

import httpx

from backend.app.config import Settings
from backend.app.services import ai_service
from backend.app.services.ai_service import (
    MEDICAL_DOCUMENT_SCHEMA,
    AIInsightService,
    _gemini_schema,
    _medical_analysis_from_json,
)


def test_used_up_quota_goes_straight_to_the_fallback_model(monkeypatch):
    calls = []

    def gemini(request):
        calls.append(request.url.path.rsplit("/", 1)[-1])
        if "primary" in request.url.path:
            return httpx.Response(429, json={"error": {"status": "RESOURCE_EXHAUSTED"}})
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "{}"}]}, "finishReason": "STOP"}]})

    async def no_waiting(_seconds):
        raise AssertionError("a used-up quota does not come back in seconds, so it must not be retried")

    real_client = httpx.AsyncClient
    monkeypatch.setattr(ai_service.httpx, "AsyncClient", lambda **options: real_client(transport=httpx.MockTransport(gemini), **options))
    monkeypatch.setattr(ai_service.asyncio, "sleep", no_waiting)
    service = AIInsightService(Settings(ai_provider="google", google_ai_api_key="test-key",
                                        google_ai_model="primary", google_ai_fallback_model="fallback"))
    output = asyncio.run(service._gemini_generate(instruction="i", text="t", schema={"type": "object"}))
    assert output == "{}" and calls == ["primary:generateContent", "fallback:generateContent"]


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
