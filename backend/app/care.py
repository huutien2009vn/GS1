"""Family sharing: a patient invites a relative with a one-time code; the relative gets read-only access."""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import current_user
from .database import get_session
from .models import Assessment, CareCodeFailure, CareInvite, CareLink, User
from .schemas import AccountProfile, AssessmentHistoryItem, AssessmentResult
from .services.risk_engine import risk_overview

router = APIRouter(prefix="/api/care", tags=["care"])

# No 0/O/1/I/L, so a code read aloud or typed on a phone is not mistaken.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 8
INVITE_HOURS = 24
MAX_FAILED_CODES = 5
FAILED_WINDOW_SECONDS = 15 * 60


class CareLinkCreate(BaseModel):
    code: str = Field(min_length=4, max_length=32)


def _digest(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _normalize(code: str) -> str:
    return "".join(ch for ch in code.upper() if ch.isalnum())


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


async def linked_patient(patient_id: str, user: User, session: AsyncSession) -> User:
    """Return the patient only when an active link gives this user access. 404 hides whether the id exists."""
    link = await session.scalar(select(CareLink).where(CareLink.patient_id == patient_id, CareLink.caregiver_id == user.id))
    patient = await session.get(User, patient_id) if link else None
    if not patient:
        raise HTTPException(404, "Không tìm thấy hồ sơ được chia sẻ.")
    return patient


@router.post("/invites", status_code=201)
async def create_invite(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    if not user.onboarding_completed or not user.health_profile:
        raise HTTPException(409, "Hãy hoàn thành hồ sơ sức khỏe trước khi chia sẻ.")
    # One live code per patient: a new code cancels the previous one.
    await session.execute(delete(CareInvite).where(CareInvite.patient_id == user.id))
    code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
    expires_at = datetime.now(timezone.utc) + timedelta(hours=INVITE_HOURS)
    session.add(CareInvite(code_hash=_digest(code), patient_id=user.id, expires_at=expires_at))
    await session.commit()
    return {"code": code, "expires_at": expires_at}


@router.post("/links", status_code=201)
async def accept_invite(payload: CareLinkCreate, user: User = Depends(current_user),
                        session: AsyncSession = Depends(get_session)):
    # Counted in the database so the limit holds across workers and serverless instances.
    since = datetime.now(timezone.utc) - timedelta(seconds=FAILED_WINDOW_SECONDS)
    failures = await session.scalar(select(func.count()).select_from(CareCodeFailure).where(
        CareCodeFailure.user_id == user.id, CareCodeFailure.created_at >= since))
    if failures >= MAX_FAILED_CODES:
        raise HTTPException(429, "Bạn đã nhập sai mã quá nhiều lần. Hãy thử lại sau 15 phút.")
    invite = await session.get(CareInvite, _digest(_normalize(payload.code)))
    if not invite or _aware(invite.expires_at) <= datetime.now(timezone.utc):
        session.add(CareCodeFailure(user_id=user.id))
        await session.commit()
        raise HTTPException(404, "Mã không đúng hoặc đã hết hạn. Hãy xin người thân tạo mã mới.")
    if invite.patient_id == user.id:
        raise HTTPException(400, "Đây là mã của chính bạn. Hãy gửi mã này cho người thân.")
    patient = await session.get(User, invite.patient_id)
    link = await session.scalar(select(CareLink).where(CareLink.patient_id == invite.patient_id,
                                                      CareLink.caregiver_id == user.id))
    if not link:
        link = CareLink(patient_id=invite.patient_id, caregiver_id=user.id)
        session.add(link)
    await session.delete(invite)  # single use
    await session.execute(delete(CareCodeFailure).where(CareCodeFailure.user_id == user.id))
    await session.flush()
    result = {"link_id": link.id, "patient_id": patient.id, "display_name": patient.display_name}
    await session.commit()
    return result


@router.get("/links")
async def list_links(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    links = list(await session.scalars(select(CareLink).where(
        or_(CareLink.patient_id == user.id, CareLink.caregiver_id == user.id)).order_by(CareLink.created_at)))
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    patients, caregivers = [], []
    for link in links:
        if link.caregiver_id == user.id:
            patient = await session.get(User, link.patient_id)
            rows = list(await session.scalars(select(Assessment).where(Assessment.user_id == patient.id)
                                              .order_by(Assessment.created_at.desc()).limit(30)))
            danger = next((row for row in rows if _aware(row.created_at) >= since
                           and any(alert.get("severity") == "alert" for alert in row.result.get("alerts", []))), None)
            latest = rows[0] if rows else None
            patients.append({
                "link_id": link.id, "patient_id": patient.id, "display_name": patient.display_name,
                "latest": latest and {"created_at": latest.created_at, "risk_level": latest.risk_level, "vitals": latest.vitals},
                "recent_emergency_at": danger and danger.created_at,
            })
        else:
            caregiver = await session.get(User, link.caregiver_id)
            caregivers.append({"link_id": link.id, "display_name": caregiver.display_name, "created_at": link.created_at})
    return {"patients": patients, "caregivers": caregivers}


@router.delete("/links/{link_id}", status_code=204)
async def remove_link(link_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    link = await session.get(CareLink, link_id)
    if not link or user.id not in (link.patient_id, link.caregiver_id):
        raise HTTPException(404, "Không tìm thấy liên kết này.")
    await session.delete(link)
    await session.commit()
    return Response(status_code=204)


@router.get("/patients/{patient_id}/profile")
async def patient_profile(patient_id: str, user: User = Depends(current_user),
                          session: AsyncSession = Depends(get_session)):
    patient = await linked_patient(patient_id, user, session)
    health = patient.health_profile or {}
    # Shared: profile and family tree. Not shared: email, free-text notes, consents, scanned documents.
    return {"display_name": patient.display_name,
            "health": {"display_name": patient.display_name, "profile": health.get("profile"),
                       "family_history": health.get("family_history", [])}}


@router.get("/patients/{patient_id}/risk")
async def patient_risk(patient_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    patient = await linked_patient(patient_id, user, session)
    if not patient.health_profile:
        raise HTTPException(404, "Không tìm thấy hồ sơ được chia sẻ.")
    vital_score = await session.scalar(select(Assessment.vital_score).where(Assessment.user_id == patient.id)
                                       .order_by(Assessment.created_at.desc()).limit(1))
    return risk_overview(AccountProfile.model_validate(patient.health_profile), vital_score)


@router.get("/patients/{patient_id}/assessments", response_model=list[AssessmentHistoryItem])
async def patient_assessments(patient_id: str, limit: int = Query(default=100, ge=1, le=100),
                              user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    patient = await linked_patient(patient_id, user, session)
    return list(await session.scalars(select(Assessment).where(Assessment.user_id == patient.id)
                                      .order_by(Assessment.created_at.desc()).limit(limit)))


@router.get("/patients/{patient_id}/assessments/{assessment_id}", response_model=AssessmentResult)
async def patient_assessment(patient_id: str, assessment_id: str, user: User = Depends(current_user),
                             session: AsyncSession = Depends(get_session)):
    patient = await linked_patient(patient_id, user, session)
    record = await session.scalar(select(Assessment).where(Assessment.id == assessment_id, Assessment.user_id == patient.id))
    if not record:
        raise HTTPException(404, "Không tìm thấy lần theo dõi này.")
    return AssessmentResult.model_validate(record.result | {"id": record.id})
