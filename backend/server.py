from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os, logging, uuid, jwt, bcrypt, re
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import List, Optional, Literal
from datetime import datetime, timedelta, timezone
from pg_store import db, init_pool, close_pool
from push import register_device, unregister_device
from services.notifications import (
    NotificationService,
    get_prefs as get_notification_prefs,
    set_prefs as set_notification_prefs,
    list_inbox,
    mark_read,
    mark_all_read,
    delete_notification,
    unread_count,
    DEFAULT_PREFS,
    list_push_devices,
    deliver_push_detailed,
)
from services.analytics import AnalyticsService, admin_overview

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

JWT_SECRET = os.environ.get('JWT_SECRET', 'stagelink-dev-secret-change-me')
JWT_ALGO = 'HS256'
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
# Comma-separated user ids allowed to hit /api/admin/analytics
ADMIN_USER_IDS = {
    x.strip() for x in os.environ.get('ADMIN_USER_IDS', '').split(',') if x.strip()
}
# Launch market — expand in a later release
ALLOWED_CITY = 'Hyderabad'

# Generic cover images when a listing has no user photo (Discover cards stay non-blank)
DEFAULT_COVERS = {
    'band': 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80',
    'equipment': 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1200&q=80',
    'studio': 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1200&q=80',
    'lesson': 'https://images.unsplash.com/photo-1514320291840-3095421dfa9a?auto=format&fit=crop&w=1200&q=80',
    'venue': 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1200&q=80',
    'gig': 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1200&q=80',
}

def _default_cover(kind: str, cover_url: Optional[str] = None, images: Optional[list] = None) -> str:
    if cover_url and str(cover_url).strip():
        return str(cover_url).strip()
    if images:
        for u in images:
            if u and str(u).strip():
                return str(u).strip()
    return DEFAULT_COVERS.get(kind, DEFAULT_COVERS['gig'])

def _force_city(v) -> str:
    return ALLOWED_CITY

def _city_query(city: Optional[str] = None) -> dict:
    """Launch market: always scope list queries to Hyderabad."""
    return {'city': {'$regex': f'^{ALLOWED_CITY}$', '$options': 'i'}}

def _normalize_phone(v):
    """Optional mobile — allow 10–15 digits, optional leading +."""
    if v is None:
        return None
    if not isinstance(v, str):
        v = str(v)
    s = re.sub(r'[\s\-()]', '', v.strip())
    if not s:
        return None
    if not re.fullmatch(r'\+?[0-9]{10,15}', s):
        raise ValueError('Enter a valid mobile number (10–15 digits)')
    return s

def _normalize_portfolio_items(items) -> list:
    """Always return a list of portfolio dicts; drop unusable entries."""
    if not isinstance(items, list):
        return []
    out = []
    for it in items:
        if not isinstance(it, dict):
            continue
        url = str(it.get('media_url') or '').strip()
        if not url:
            continue
        # Link-based portfolio: keep http(s). Legacy data:/file: uploads are
        # omitted from profile payloads (they bloat responses and don't open).
        if url.startswith('http://') or url.startswith('https://'):
            out.append(dict(it))
        elif url.startswith('data:') or url.startswith('file://') or url.startswith('content://'):
            continue
        else:
            # Relative /api/media/... still useful for older uploads
            out.append(dict(it))
    return out


def _merge_list_by_id(lists: list) -> list:
    """Union list-of-dicts by `id`, preserving first-seen order."""
    merged = []
    seen = set()
    for lst in lists:
        if not isinstance(lst, list):
            continue
        for it in lst:
            if not isinstance(it, dict):
                continue
            iid = it.get('id')
            if iid:
                if iid in seen:
                    continue
                seen.add(iid)
            merged.append(dict(it))
    return merged


def _merge_musician_docs(docs: list) -> dict:
    """Merge duplicate musician rows for the same user_id into one profile."""
    if not docs:
        return {}
    if len(docs) == 1:
        return dict(docs[0])
    # Prefer the most complete document as the base (most keys / longest bio).
    ranked = sorted(
        docs,
        key=lambda d: (
            len(d.keys()),
            len(str(d.get('bio') or '')),
            len(d.get('portfolio_items') or []) if isinstance(d.get('portfolio_items'), list) else 0,
        ),
        reverse=True,
    )
    base = dict(ranked[0])
    base['portfolio_items'] = _merge_list_by_id([d.get('portfolio_items') for d in docs])
    base['services'] = _merge_list_by_id([d.get('services') for d in docs])
    # Fill missing scalar fields from other docs
    for d in ranked[1:]:
        for k, v in d.items():
            if k in ('portfolio_items', 'services'):
                continue
            if base.get(k) in (None, '', [], {}) and v not in (None, '', [], {}):
                base[k] = v
    return base


async def _load_musician(user_id: str) -> Optional[dict]:
    """Load a musician profile, merging duplicates and normalizing portfolio."""
    docs = await db.musicians.find({'user_id': user_id}, {'_id': 0}).to_list(50)
    if not docs:
        return None
    m = _merge_musician_docs(docs)
    m['portfolio_items'] = _normalize_portfolio_items(m.get('portfolio_items'))
    if not isinstance(m.get('services'), list):
        m['services'] = []
    # If duplicates exist, sync merged portfolio/services onto every row so
    # subsequent find_one hits stay consistent.
    if len(docs) > 1:
        try:
            await db.musicians.update_many(
                {'user_id': user_id},
                {'$set': {
                    'portfolio_items': m.get('portfolio_items') or [],
                    'services': m.get('services') or [],
                    'updated_at': now_iso(),
                }},
            )
        except Exception:
            pass
    return m


def _public_profile(m: dict, is_self: bool = False) -> dict:
    """Strip private contact fields for non-owners when hide_contact is on.

    Phone is public only when hide_contact is explicitly False. Missing /
    True / truthy → hide from other viewers.
    """
    out = dict(m or {})
    # Always expose a normalized portfolio list so the profile UI can render links.
    out['portfolio_items'] = _normalize_portfolio_items(out.get('portfolio_items'))
    if not isinstance(out.get('services'), list):
        out['services'] = []
    if is_self:
        return out
    # Contact: opt-in to share (explicit False = public)
    if out.get('hide_contact') is not False:
        out.pop('phone', None)
        out['hide_contact'] = True
    if out.get('hide_pricing'):
        out['pricing_per_hour'] = None
        out['pricing_type'] = None
        if isinstance(out.get('services'), list):
            out['services'] = [{**s, 'price': None} if isinstance(s, dict) else s for s in out['services']]
    if out.get('hide_location'):
        out.pop('state', None)
    return out

DEFAULT_ONBOARDING_CONFIG = {
    'cities': [ALLOWED_CITY],
    'default_city': ALLOWED_CITY,
    'city_note': 'gigZee is live in Hyderabad for now. More cities soon.',
    'interests_prompt': 'What brings you to gigZee?',
    'interests': [
        'Perform', 'Hire talent', 'Sell equipment', 'Rent equipment',
        'Teach', 'Book studios', 'Build a band',
    ],
}

DEFAULT_PROFILE_OPTIONS = {
    'professions': [
        'Singer', 'Guitarist', 'Drummer', 'Keyboardist', 'Violinist', 'DJ',
        'Music Producer', 'Sound Engineer', 'Vocal Coach', 'Composer',
        'Music Teacher', 'Event Host',
    ],
    'skills': [
        'Live Performance', 'Music Production', 'Recording', 'Mixing',
        'Mastering', 'Song Writing', 'Improvisation', 'Session Work',
    ],
    'genres': [
        'Jazz', 'Pop', 'Rock', 'Indie', 'EDM', 'Classical', 'Fusion',
        'R&B', 'Soul', 'House', 'Bollywood', 'Carnatic', 'Hindustani',
    ],
    'instruments': [
        'Vocals', 'Guitar', 'Keyboard', 'Violin', 'Drums', 'Bass',
        'DJ Deck', 'Saxophone', 'Tabla', 'Sitar',
    ],
    'languages': [
        'English', 'Hindi', 'Marathi', 'Tamil', 'Telugu',
        'Kannada', 'Punjabi', 'Bengali',
    ],
    # Base-rate / service units — not always hourly
    'pricing_types': [
        'per_event', 'per_session', 'per_hour', 'per_song', 'per_day', 'starting_at',
    ],
}

PricingType = Literal['per_event', 'per_session', 'per_hour', 'per_song', 'per_day', 'starting_at']


app = FastAPI(title="gigZee API")
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

# ================== Models ==================
Role = Literal['musician', 'organizer']

def _validate_password(p: str) -> str:
    if not isinstance(p, str) or len(p) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not re.search(r'[A-Za-z]', p) or not re.search(r'\d', p):
        raise ValueError("Password must contain letters and numbers")
    return p

class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    full_name: str

    @field_validator('password')
    @classmethod
    def _v_pw(cls, v): return _validate_password(v)

    @field_validator('full_name')
    @classmethod
    def _v_name(cls, v):
        v = (v or '').strip()
        if len(v) < 2: raise ValueError("Full name is too short")
        return v

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class RefreshIn(BaseModel):
    refresh_token: str

class UserOut(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    roles: List[str] = []
    active_role: Optional[str] = None
    onboarded: bool = False
    avatar_url: Optional[str] = None
    verified: bool = False
    premium: bool = False

class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    user: UserOut

class RolesIn(BaseModel):
    roles: List[Role]  # musician, organizer, or both

class ActiveRoleIn(BaseModel):
    active_role: Role

class MusicianProfileIn(BaseModel):
    bio: Optional[str] = ""
    tagline: Optional[str] = None
    username: Optional[str] = None
    city: str = ALLOWED_CITY
    state: Optional[str] = None
    country: Optional[str] = "India"
    genres: List[str] = []
    instruments: List[str] = []
    languages: List[str] = []
    professions: List[str] = []
    skills: List[str] = []
    interests: List[str] = []
    experience_years: int = 0
    # Amount stored in pricing_per_hour for backward compatibility; unit is pricing_type
    pricing_per_hour: int = 0
    pricing_type: PricingType = 'per_event'
    willing_to_travel: bool = True
    travel_radius_km: Optional[int] = 50
    dob: Optional[str] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    demo_video_url: Optional[str] = None
    youtube_url: Optional[str] = None
    instagram_url: Optional[str] = None
    facebook_url: Optional[str] = None
    spotify_url: Optional[str] = None
    soundcloud_url: Optional[str] = None
    website_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    apple_music_url: Optional[str] = None
    avatar_url: Optional[str] = None
    cover_url: Optional[str] = None
    visibility: Optional[Literal['public', 'followers', 'private']] = 'public'
    hide_pricing: Optional[bool] = False
    hide_location: Optional[bool] = False
    hide_contact: Optional[bool] = False

    @field_validator('city', mode='before')
    @classmethod
    def _city(cls, v): return _force_city(v)

    @field_validator('phone', mode='before')
    @classmethod
    def _phone(cls, v): return _normalize_phone(v)

class ProfilePatchIn(BaseModel):
    """Partial update for a musician profile. All fields optional."""
    bio: Optional[str] = None
    tagline: Optional[str] = None
    username: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    genres: Optional[List[str]] = None
    instruments: Optional[List[str]] = None
    languages: Optional[List[str]] = None
    professions: Optional[List[str]] = None
    skills: Optional[List[str]] = None
    interests: Optional[List[str]] = None
    experience_years: Optional[int] = None
    pricing_per_hour: Optional[int] = None
    pricing_type: Optional[PricingType] = None
    willing_to_travel: Optional[bool] = None
    travel_radius_km: Optional[int] = None
    dob: Optional[str] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    demo_video_url: Optional[str] = None
    youtube_url: Optional[str] = None
    instagram_url: Optional[str] = None
    facebook_url: Optional[str] = None
    spotify_url: Optional[str] = None
    soundcloud_url: Optional[str] = None
    website_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    apple_music_url: Optional[str] = None
    avatar_url: Optional[str] = None
    cover_url: Optional[str] = None
    visibility: Optional[Literal['public', 'followers', 'private']] = None
    hide_pricing: Optional[bool] = None
    hide_location: Optional[bool] = None
    hide_contact: Optional[bool] = None
    availability: Optional[dict] = None  # {weekly:{mon..sun:[slots]}, unavailable_dates:[], vacation:{start,end}}

    @field_validator('city', mode='before')
    @classmethod
    def _city(cls, v):
        if v is None: return None
        return _force_city(v)

    @field_validator('phone', mode='before')
    @classmethod
    def _phone(cls, v):
        if v is None: return None
        return _normalize_phone(v)

class PortfolioItemIn(BaseModel):
    """Portfolio entry as an external link (Google Drive, Dropbox, YouTube, etc.)."""
    title: Optional[str] = "Portfolio link"
    description: Optional[str] = ""
    category: Optional[str] = "Performance"
    media_url: str  # https link
    media_type: Literal['link', 'image', 'video'] = 'link'
    thumbnail_url: Optional[str] = None
    tags: List[str] = []
    date: Optional[str] = None

    @field_validator('title', mode='before')
    @classmethod
    def _title(cls, v):
        t = (str(v) if v is not None else "").strip()
        return (t or "Portfolio link")[:120]

    @field_validator('media_url')
    @classmethod
    def _media_url_https(cls, v: str):
        url = (v or "").strip()
        if not url:
            raise ValueError("Portfolio link is required")
        # Allow paste without scheme
        if not (url.startswith("http://") or url.startswith("https://")):
            url = f"https://{url}"
        if len(url) > 2000:
            raise ValueError("Link is too long")
        return url

    @field_validator('media_type', mode='before')
    @classmethod
    def _media_type_link(cls, v):
        # Force link-based portfolio (uploads removed).
        return 'link'


# Max external portfolio links per profile
PORTFOLIO_MAX_LINKS = 5
PORTFOLIO_MAX_IMAGES = 5  # legacy alias for older clients
PORTFOLIO_MAX_VIDEOS = 0

class ServiceIn(BaseModel):
    title: str
    description: str
    price: int
    pricing_type: PricingType = 'per_event'
    duration: Optional[str] = None

class OrganizerProfileIn(BaseModel):
    org_name: str
    city: str = ALLOWED_CITY
    bio: Optional[str] = ""
    avatar_url: Optional[str] = None

    @field_validator('city', mode='before')
    @classmethod
    def _city(cls, v): return _force_city(v)

class GigCreate(BaseModel):
    title: str
    city: str = ALLOWED_CITY
    date: str
    event_type: str
    genre: str
    instrument_needed: str
    budget: int
    description: str
    cover_url: Optional[str] = None

    @field_validator('city', mode='before')
    @classmethod
    def _city(cls, v): return _force_city(v)

class ApplicationIn(BaseModel):
    gig_id: str
    message: Optional[str] = ""

class ReviewIn(BaseModel):
    target_user_id: str
    rating: int
    comment: str

class MessageIn(BaseModel):
    thread_id: Optional[str] = None
    to_user_id: Optional[str] = None
    text: str

class DeviceRegisterIn(BaseModel):
    token: Optional[str] = None
    expo_push_token: Optional[str] = None
    platform: Optional[str] = None
    device_name: Optional[str] = None

    def resolved_token(self) -> str:
        return (self.expo_push_token or self.token or "").strip()

class DeviceUnregisterIn(BaseModel):
    token: Optional[str] = None
    expo_push_token: Optional[str] = None

    def resolved_token(self) -> str:
        return (self.expo_push_token or self.token or "").strip()

class NotificationPrefsIn(BaseModel):
    messages: Optional[bool] = None
    social: Optional[bool] = None
    community: Optional[bool] = None
    gigs: Optional[bool] = None
    bands: Optional[bool] = None
    equipment: Optional[bool] = None
    studios: Optional[bool] = None
    lessons: Optional[bool] = None
    promotions: Optional[bool] = None
    system: Optional[bool] = None

class AnalyticsTrackIn(BaseModel):
    event_name: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    metadata: Optional[dict] = None
    platform: Optional[str] = None
    device: Optional[str] = None
    app_version: Optional[str] = None

class AIBioIn(BaseModel):
    tone: str = "professional"

class AIPricingIn(BaseModel):
    city: str = ALLOWED_CITY
    experience_years: int
    genres: List[str]
    instruments: List[str]

    @field_validator('city', mode='before')
    @classmethod
    def _city(cls, v): return _force_city(v)

# ================== Entity Models ==================
class BandIn(BaseModel):
    name: str
    city: str = ALLOWED_CITY
    genres: List[str] = []
    description: Optional[str] = ""
    cover_url: Optional[str] = None
    looking_for: List[str] = []

    @field_validator('city', mode='before')
    @classmethod
    def _city(cls, v): return _force_city(v)

EQUIPMENT_MAX_IMAGES = 3
STUDIO_MAX_IMAGES = 3

class EquipmentIn(BaseModel):
    title: str
    listing_type: Literal['rent', 'sale']
    category: str  # guitar, mic, monitor, etc.
    city: str = ALLOWED_CITY
    price: int
    description: str
    cover_url: Optional[str] = None
    images: List[str] = Field(default_factory=list)  # up to EQUIPMENT_MAX_IMAGES

    @field_validator('city', mode='before')
    @classmethod
    def _city(cls, v): return _force_city(v)

    @field_validator('images', mode='before')
    @classmethod
    def _images(cls, v):
        if v is None:
            return []
        if not isinstance(v, list):
            raise ValueError('images must be a list')
        urls = [str(x).strip() for x in v if x and str(x).strip()]
        if len(urls) < 1:
            raise ValueError('At least one image is required')
        if len(urls) > EQUIPMENT_MAX_IMAGES:
            raise ValueError(f'Max {EQUIPMENT_MAX_IMAGES} images allowed')
        return urls

class StudioIn(BaseModel):
    name: str
    city: str = ALLOWED_CITY
    hourly_rate: int
    description: str
    cover_url: Optional[str] = None
    maps_url: Optional[str] = None  # Google / Apple Maps share link
    images: List[str] = Field(default_factory=list)  # up to STUDIO_MAX_IMAGES

    @field_validator('city', mode='before')
    @classmethod
    def _city(cls, v): return _force_city(v)

    @field_validator('maps_url', mode='before')
    @classmethod
    def _maps_url(cls, v):
        if v is None:
            return None
        s = str(v).strip()
        if not s:
            return None
        if not re.match(r'^https?://', s, re.I):
            raise ValueError('Maps link must start with http:// or https://')
        return s

    @field_validator('images', mode='before')
    @classmethod
    def _images(cls, v):
        if v is None:
            return []
        if not isinstance(v, list):
            raise ValueError('images must be a list')
        urls = [str(x).strip() for x in v if x and str(x).strip()]
        if len(urls) < 1:
            raise ValueError('At least one image is required')
        if len(urls) > STUDIO_MAX_IMAGES:
            raise ValueError(f'Max {STUDIO_MAX_IMAGES} images allowed')
        return urls

class LessonIn(BaseModel):
    title: str
    subject: str  # instrument or theory area
    city: str = ALLOWED_CITY
    price_per_hour: int
    format: Literal['online', 'in-person', 'both'] = 'both'
    description: str
    cover_url: Optional[str] = None

    @field_validator('city', mode='before')
    @classmethod
    def _city(cls, v): return _force_city(v)

class PostIn(BaseModel):
    text: str
    media_url: str  # required — at least one image
    media_type: Optional[Literal['image', 'video']] = 'image'
    visibility: Optional[Literal['public', 'followers', 'private']] = 'public'

    @field_validator('media_url', mode='before')
    @classmethod
    def _media_url(cls, v):
        if v is None or not str(v).strip():
            raise ValueError('At least one image is required')
        return str(v).strip()

    @field_validator('media_type', mode='before')
    @classmethod
    def _media_type(cls, v):
        if v is None or v == '':
            return 'image'
        if v != 'image':
            raise ValueError('Posts require an image')
        return v

class CommentIn(BaseModel):
    post_id: str
    text: str
    parent_id: Optional[str] = None  # reply-to comment id

class NotificationTestIn(BaseModel):
    title: Optional[str] = "gigZee test"
    body: Optional[str] = "Push notifications are working."

class PostUpdate(BaseModel):
    text: Optional[str] = None
    media_url: Optional[str] = None
    media_type: Optional[Literal['image', 'video']] = None
    visibility: Optional[Literal['public', 'followers', 'private']] = None

# ================== Helpers ==================
MENTION_RE = re.compile(r'@([A-Za-z0-9_]{2,32})')

def now_iso():
    return datetime.now(timezone.utc).isoformat()

async def _notify_mentions(text: str, actor: dict, deep_link: str, skip_ids: Optional[set] = None):
    """Notify users mentioned as @username in text (musician profile username)."""
    handles = set(MENTION_RE.findall(text or ''))
    if not handles:
        return
    skip = set(skip_ids or set())
    skip.add(actor.get('id'))
    preview = (text or '').strip()
    preview = preview[:80] + ('…' if len(preview) > 80 else '')
    for handle in handles:
        m = await db.musicians.find_one(
            {'username': {'$regex': f'^{re.escape(handle)}$', '$options': 'i'}},
            {'_id': 0, 'user_id': 1},
        )
        uid = (m or {}).get('user_id')
        if not uid or uid in skip:
            continue
        skip.add(uid)
        NotificationService.mention(uid, actor, preview, deep_link)

def hash_pw(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()

def verify_pw(p: str, h: str) -> bool:
    try: return bcrypt.checkpw(p.encode(), h.encode())
    except: return False

def make_access_token(uid: str) -> str:
    return jwt.encode({'sub': uid, 'type': 'access',
                       'exp': datetime.now(timezone.utc) + timedelta(hours=24)},
                      JWT_SECRET, algorithm=JWT_ALGO)

def make_refresh_token(uid: str) -> str:
    return jwt.encode({'sub': uid, 'type': 'refresh', 'jti': str(uuid.uuid4()),
                       'exp': datetime.now(timezone.utc) + timedelta(days=30)},
                      JWT_SECRET, algorithm=JWT_ALGO)

def make_token_pair(uid: str) -> dict:
    return {'access_token': make_access_token(uid),
            'refresh_token': make_refresh_token(uid)}

# Simple in-memory brute-force protection
_login_attempts: dict = {}
def _check_bruteforce(email: str) -> None:
    now = datetime.now(timezone.utc)
    entry = _login_attempts.get(email, {'count': 0, 'lock_until': None})
    if entry['lock_until'] and now < entry['lock_until']:
        raise HTTPException(429, "Too many attempts. Try again in a few minutes.")
    if entry['lock_until'] and now >= entry['lock_until']:
        _login_attempts[email] = {'count': 0, 'lock_until': None}

def _record_login_fail(email: str) -> None:
    entry = _login_attempts.get(email, {'count': 0, 'lock_until': None})
    entry['count'] += 1
    if entry['count'] >= 6:
        entry['lock_until'] = datetime.now(timezone.utc) + timedelta(minutes=10)
    _login_attempts[email] = entry

def _clear_login_fail(email: str) -> None:
    _login_attempts.pop(email, None)

async def get_user(cred: HTTPAuthorizationCredentials = Depends(security)):
    if not cred:
        raise HTTPException(401, "Missing token")
    try:
        payload = jwt.decode(cred.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
        if payload.get('type') and payload.get('type') != 'access':
            raise HTTPException(401, "Invalid token type")
        uid = payload['sub']
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(401, "Invalid token")
    u = await db.users.find_one({'id': uid}, {'_id': 0, 'password_hash': 0})
    if not u: raise HTTPException(401, "User not found")
    return u

def user_public(u: dict) -> dict:
    return {
        'id': u['id'], 'email': u['email'], 'full_name': u['full_name'],
        'roles': u.get('roles', []), 'active_role': u.get('active_role'),
        'onboarded': u.get('onboarded', False), 'avatar_url': u.get('avatar_url'),
        'verified': u.get('verified', False), 'premium': u.get('premium', False),
    }

# ================== Auth ==================
@api.post("/auth/register", response_model=TokenOut)
async def register(inp: RegisterIn):
    email = inp.email.lower().strip()
    if await db.users.find_one({'email': email}):
        raise HTTPException(400, "Email already registered")
    uid = str(uuid.uuid4())
    doc = {'id': uid, 'email': email, 'full_name': inp.full_name,
           'password_hash': hash_pw(inp.password), 'roles': [], 'active_role': None,
           'onboarded': False, 'created_at': now_iso(), 'avatar_url': None,
           'verified': False, 'premium': False}
    await db.users.insert_one(doc)
    AnalyticsService.schedule(uid, "signup", metadata={"funnel": "signup_completed"})
    AnalyticsService.schedule(uid, "signup_completed", metadata={"funnel": True})
    return {**make_token_pair(uid), 'user': user_public(doc)}

@api.post("/auth/login", response_model=TokenOut)
async def login(inp: LoginIn):
    email = inp.email.lower().strip()
    _check_bruteforce(email)
    u = await db.users.find_one({'email': email})
    if not u or not verify_pw(inp.password, u['password_hash']):
        _record_login_fail(email)
        raise HTTPException(401, "Invalid email or password")
    _clear_login_fail(email)
    AnalyticsService.schedule(u['id'], "login")
    return {**make_token_pair(u['id']), 'user': user_public(u)}

@api.post("/auth/refresh")
async def refresh(inp: RefreshIn):
    try:
        payload = jwt.decode(inp.refresh_token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Refresh token expired")
    except Exception:
        raise HTTPException(401, "Invalid refresh token")
    if payload.get('type') != 'refresh':
        raise HTTPException(401, "Invalid token type")
    uid = payload.get('sub')
    u = await db.users.find_one({'id': uid}, {'_id': 0, 'password_hash': 0})
    if not u:
        raise HTTPException(401, "User not found")
    return {**make_token_pair(uid), 'user': user_public(u)}

@api.post("/auth/logout")
async def logout(u=Depends(get_user)):
    # Stateless JWT — client is responsible for discarding tokens.
    AnalyticsService.schedule(u['id'], "logout")
    return {'ok': True}

@api.get("/auth/me", response_model=UserOut)
async def me(u=Depends(get_user)):
    return user_public(u)

@api.delete("/auth/me")
async def delete_account(u=Depends(get_user)):
    """Permanently delete the authenticated user and cascade owned data."""
    uid = u['id']

    posts = await db.posts.find({'author_id': uid}, {'_id': 0, 'id': 1}).to_list(10000)
    post_ids = [p['id'] for p in posts]
    if post_ids:
        await db.comments.delete_many({'post_id': {'$in': post_ids}})
        await db.likes.delete_many({'post_id': {'$in': post_ids}})
    await db.posts.delete_many({'author_id': uid})
    await db.comments.delete_many({'author_id': uid})
    await db.likes.delete_many({'user_id': uid})

    gigs = await db.gigs.find({'organizer_id': uid}, {'_id': 0, 'id': 1}).to_list(10000)
    gig_ids = [g['id'] for g in gigs]
    if gig_ids:
        await db.applications.delete_many({'gig_id': {'$in': gig_ids}})
    await db.gigs.delete_many({'organizer_id': uid})
    await db.applications.delete_many({'musician_id': uid})

    await db.bands.delete_many({'owner_id': uid})
    await db.equipment.delete_many({'owner_id': uid})
    await db.studios.delete_many({'owner_id': uid})
    await db.lessons.delete_many({'teacher_id': uid})

    await db.follows.delete_many({'$or': [{'follower_id': uid}, {'target_user_id': uid}]})
    await db.reviews.delete_many({'$or': [{'author_id': uid}, {'target_user_id': uid}]})
    await db.messages.delete_many({'$or': [{'from_id': uid}, {'to_id': uid}]})

    await db.musicians.delete_many({'user_id': uid})
    await db.organizers.delete_many({'user_id': uid})
    await db.device_tokens.delete_many({'user_id': uid})
    await db.push_devices.delete_many({'user_id': uid})
    await db.notifications.delete_many({'recipient_id': uid})
    await db.notification_prefs.delete_many({'user_id': uid})
    await db.users.delete_one({'id': uid})
    return {'ok': True}

@api.post("/devices/register")
async def devices_register(inp: DeviceRegisterIn, u=Depends(get_user)):
    tok = inp.resolved_token()
    if not tok:
        raise HTTPException(400, "token required")
    try:
        doc = await register_device(u['id'], tok, inp.platform, inp.device_name)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {'ok': True, 'device': doc}

@api.post("/devices/unregister")
async def devices_unregister(inp: DeviceUnregisterIn, u=Depends(get_user)):
    tok = inp.resolved_token()
    if not tok:
        raise HTTPException(400, "token required")
    await unregister_device(u['id'], tok)
    return {'ok': True}

@api.get("/devices")
async def devices_list(u=Depends(get_user)):
    """List Expo push devices registered for the authenticated user."""
    devices = await list_push_devices(u['id'])
    active = [d for d in devices if d.get('is_active')]
    return {
        'devices': devices,
        'active_count': len(active),
        'total_count': len(devices),
    }

# ================== Notifications (inbox + prefs) ==================
@api.get("/notifications")
async def notifications_list(
    u=Depends(get_user),
    limit: int = 30,
    offset: int = 0,
    unread_only: bool = False,
):
    return await list_inbox(u['id'], limit=limit, offset=offset, unread_only=unread_only)

@api.get("/notifications/unread-count")
async def notifications_unread(u=Depends(get_user)):
    return {'unread': await unread_count(u['id'])}

@api.post("/notifications/{nid}/read")
async def notifications_mark_read(nid: str, u=Depends(get_user)):
    ok = await mark_read(u['id'], nid)
    if not ok:
        raise HTTPException(404, "Not found")
    return {'ok': True}

@api.post("/notifications/read-all")
async def notifications_mark_all(u=Depends(get_user)):
    n = await mark_all_read(u['id'])
    return {'ok': True, 'updated': n}

@api.delete("/notifications/{nid}")
async def notifications_delete(nid: str, u=Depends(get_user)):
    ok = await delete_notification(u['id'], nid)
    if not ok:
        raise HTTPException(404, "Not found")
    return {'ok': True}

@api.get("/notifications/prefs")
async def notifications_get_prefs(u=Depends(get_user)):
    return {'prefs': await get_notification_prefs(u['id']), 'defaults': DEFAULT_PREFS}

@api.put("/notifications/prefs")
async def notifications_put_prefs(inp: NotificationPrefsIn, u=Depends(get_user)):
    updates = {k: v for k, v in inp.dict(exclude_unset=True).items() if v is not None}
    prefs = await set_notification_prefs(u['id'], updates)
    return {'prefs': prefs}

@api.post("/notifications/test")
async def notifications_test(inp: NotificationTestIn = NotificationTestIn(), u=Depends(get_user)):
    """Send a test push + inbox notification to the authenticated user's devices."""
    title = (inp.title or "gigZee test").strip() or "gigZee test"
    body = (inp.body or "Push notifications are working.").strip() or "Push notifications are working."
    saved = await NotificationService.send(
        u['id'],
        "system.test",
        title,
        body,
        deep_link="/notifications",
        meta={"source": "test_endpoint"},
        push=False,  # we send push with diagnostics below
        inbox=True,
    )
    push = await deliver_push_detailed(
        u['id'],
        title,
        body,
        data={
            "type": "system.test",
            "path": "/notifications",
            "notification_id": (saved or {}).get("id"),
            "source": "test_endpoint",
        },
    )
    return {
        'ok': bool(push.get('sent')),
        'notification': saved,
        'push': push,
        'message': (
            f"Push accepted for {push.get('sent', 0)} device(s)."
            if push.get('sent')
            else (push.get('error') or 'Push not delivered. Check push.tickets / push.receipts.')
        ),
    }

# ================== Analytics ==================
@api.post("/analytics/track")
async def analytics_track(inp: AnalyticsTrackIn, request: Request, u=Depends(get_user)):
    """Client-side event ingest — never blocks; fire-and-forget."""
    ip = request.client.host if request.client else None
    AnalyticsService.schedule(
        u['id'], inp.event_name,
        entity_type=inp.entity_type, entity_id=inp.entity_id,
        metadata=inp.metadata, platform=inp.platform, device=inp.device,
        app_version=inp.app_version, ip_address=ip,
    )
    return {'ok': True}

@api.get("/admin/analytics")
async def admin_analytics(days: int = 30, u=Depends(get_user)):
    if ADMIN_USER_IDS and u['id'] not in ADMIN_USER_IDS:
        raise HTTPException(403, "Admin only")
    # If ADMIN_USER_IDS unset, allow any authenticated user in early access
    # (set ADMIN_USER_IDS in Railway for production lockdown)
    return await admin_overview(days=max(1, min(days, 90)))

@api.post("/auth/roles", response_model=UserOut)
async def set_roles(inp: RolesIn, u=Depends(get_user)):
    roles = list(dict.fromkeys(inp.roles))  # dedupe preserve order
    if not roles:
        raise HTTPException(400, "Pick at least one role")
    active = u.get('active_role')
    if active not in roles:
        active = roles[0]
    await db.users.update_one({'id': u['id']}, {'$set': {'roles': roles, 'active_role': active}})
    u['roles'] = roles; u['active_role'] = active
    return user_public(u)

@api.post("/auth/active-role", response_model=UserOut)
async def set_active_role(inp: ActiveRoleIn, u=Depends(get_user)):
    # Ensure role is available; auto-add if missing (action-based model)
    roles = u.get('roles', [])
    if inp.active_role not in roles:
        roles = list(dict.fromkeys([*roles, inp.active_role]))
        await db.users.update_one({'id': u['id']}, {'$set': {'roles': roles}})
        u['roles'] = roles
    await db.users.update_one({'id': u['id']}, {'$set': {'active_role': inp.active_role}})
    u['active_role'] = inp.active_role
    return user_public(u)

# ================== Profiles ==================
@api.post("/profile/musician")
async def upsert_musician(inp: MusicianProfileIn, u=Depends(get_user)):
    doc = inp.dict()
    doc['user_id'] = u['id']
    doc['updated_at'] = now_iso()
    await db.musicians.update_one({'user_id': u['id']}, {'$set': doc}, upsert=True)
    updates = {'onboarded': True}
    if inp.avatar_url: updates['avatar_url'] = inp.avatar_url
    await db.users.update_one({'id': u['id']}, {'$set': updates})
    AnalyticsService.schedule(u['id'], "profile_completed", metadata={"funnel": True})
    return {'ok': True}

@api.patch("/profile/musician")
async def patch_musician(inp: ProfilePatchIn, u=Depends(get_user)):
    raw = inp.dict(exclude_unset=True)
    # Allow clearing optional contact fields with null/empty after normalization
    clearable = {'phone'}
    updates = {
        k: v for k, v in raw.items()
        if v is not None or k in clearable
    }
    if not updates:
        return {'ok': True, 'updated': 0}
    updates['updated_at'] = now_iso()
    await db.musicians.update_one({'user_id': u['id']}, {'$set': updates}, upsert=True)
    user_updates = {}
    if 'avatar_url' in updates: user_updates['avatar_url'] = updates['avatar_url']
    if user_updates:
        await db.users.update_one({'id': u['id']}, {'$set': user_updates})
    return {'ok': True, 'updated': len(updates) - 1}

@api.post("/profile/portfolio")
async def add_portfolio_item(inp: PortfolioItemIn, u=Depends(get_user)):
    # Merge across any duplicate musician rows so the new link is visible
    # on both /profile/musician/{id} and unified /profile/{id}.
    docs = await db.musicians.find({'user_id': u['id']}, {'_id': 0}).to_list(50)
    items = _normalize_portfolio_items(_merge_list_by_id([d.get('portfolio_items') for d in docs]))
    if len(items) >= PORTFOLIO_MAX_LINKS:
        raise HTTPException(400, f"Portfolio limit reached: max {PORTFOLIO_MAX_LINKS} links")

    raw = inp.model_dump() if hasattr(inp, "model_dump") else inp.dict()
    item = {
        "id": str(uuid.uuid4()),
        "title": (raw.get("title") or "Portfolio link").strip() or "Portfolio link",
        "description": raw.get("description") or "",
        "category": raw.get("category") or "Performance",
        "media_url": raw.get("media_url"),
        "media_type": "link",
        "thumbnail_url": raw.get("thumbnail_url"),
        "tags": raw.get("tags") or [],
        "date": raw.get("date"),
        "created_at": now_iso(),
    }
    items.append(item)

    payload = {"portfolio_items": items, "updated_at": now_iso(), "user_id": u["id"]}
    if docs:
        await db.musicians.update_many(
            {"user_id": u["id"]},
            {"$set": payload},
        )
    else:
        await db.musicians.update_one(
            {"user_id": u["id"]},
            {"$set": payload},
            upsert=True,
        )
    return item

@api.delete("/profile/portfolio/{item_id}")
async def delete_portfolio_item(item_id: str, u=Depends(get_user)):
    docs = await db.musicians.find({'user_id': u['id']}, {'_id': 0}).to_list(50)
    before = _normalize_portfolio_items(_merge_list_by_id([d.get('portfolio_items') for d in docs]))
    after = [it for it in before if it.get('id') != item_id]
    if docs:
        await db.musicians.update_many(
            {'user_id': u['id']},
            {'$set': {'portfolio_items': after, 'updated_at': now_iso()}},
        )
    return {'deleted': max(len(before) - len(after), 0)}

@api.post("/profile/services")
async def add_service(inp: ServiceIn, u=Depends(get_user)):
    svc = inp.dict()
    svc['id'] = str(uuid.uuid4())
    svc['created_at'] = now_iso()
    await db.musicians.update_one(
        {'user_id': u['id']},
        {'$push': {'services': svc}, '$set': {'updated_at': now_iso()}},
        upsert=True,
    )
    return svc

@api.delete("/profile/services/{svc_id}")
async def delete_service(svc_id: str, u=Depends(get_user)):
    before = await db.musicians.find_one({'user_id': u['id']}, {'services': 1}) or {}
    r = await db.musicians.update_one(
        {'user_id': u['id']},
        {'$pull': {'services': {'id': svc_id}}, '$set': {'updated_at': now_iso()}},
    )
    after = await db.musicians.find_one({'user_id': u['id']}, {'services': 1}) or {}
    deleted = len(before.get('services') or []) - len(after.get('services') or [])
    return {'deleted': max(deleted, 0)}

def _compute_completion(m: dict) -> dict:
    checks = [
        ('avatar_url', 'Add a profile photo', 15),
        ('cover_url', 'Add a cover photo', 5),
        ('bio', 'Write a short bio', 10),
        ('city', 'Set your city', 5),
        ('genres', 'Choose your genres', 10),
        ('instruments', 'List your instruments', 10),
        ('professions', 'Add your professions', 10),
        ('pricing_per_hour', 'Set your base rate', 10),
        ('experience_years', 'Add years of experience', 5),
        ('portfolio_items', 'Add portfolio links (Drive, etc.)', 10),
        ('services', 'List services you offer', 5),
        ('youtube_url', 'Link your YouTube', 3),
        ('instagram_url', 'Link your Instagram', 2),
    ]
    total_weight = sum(w for _, _, w in checks)
    score = 0
    missing = []
    for field, prompt, weight in checks:
        v = m.get(field)
        has = bool(v) if not isinstance(v, (int, float)) else v > 0
        if has:
            score += weight
        else:
            missing.append({'field': field, 'prompt': prompt, 'weight': weight})
    pct = int((score / total_weight) * 100)
    missing.sort(key=lambda x: -x['weight'])
    return {'completion': pct, 'suggestions': missing[:5]}

@api.get("/profile/completion")
async def profile_completion(u=Depends(get_user)):
    m = await db.musicians.find_one({'user_id': u['id']}, {'_id': 0}) or {}
    return _compute_completion(m)

@api.post("/profile/organizer")
async def upsert_organizer(inp: OrganizerProfileIn, u=Depends(get_user)):
    doc = inp.dict()
    doc['user_id'] = u['id']
    doc['updated_at'] = now_iso()
    await db.organizers.update_one({'user_id': u['id']}, {'$set': doc}, upsert=True)
    updates = {'onboarded': True}
    if inp.avatar_url: updates['avatar_url'] = inp.avatar_url
    await db.users.update_one({'id': u['id']}, {'$set': updates})
    return {'ok': True}

@api.get("/profile/musician/{user_id}")
async def get_musician(user_id: str, request: Request):
    m = await _load_musician(user_id)
    if not m: raise HTTPException(404, "Not found")
    u = await db.users.find_one({'id': user_id}, {'_id': 0, 'password_hash': 0})
    viewer = await _optional_user(request)
    is_self = bool(viewer and viewer['id'] == user_id)
    reviews = await db.reviews.find({'target_user_id': user_id}, {'_id': 0}).to_list(50)
    rating = round(sum(r['rating'] for r in reviews) / len(reviews), 1) if reviews else 0
    reliability = min(100, 60 + len(reviews) * 4)
    followers = await db.follows.count_documents({'target_user_id': user_id})
    following = await db.follows.count_documents({'follower_id': user_id})
    return {'user': user_public(u) if u else None, 'profile': _public_profile(m, is_self), 'rating': rating,
            'review_count': len(reviews), 'reliability': reliability, 'followers': followers,
            'following': following, 'reviews': reviews[:10]}

@api.get("/profile/organizer/{user_id}")
async def get_organizer(user_id: str):
    o = await db.organizers.find_one({'user_id': user_id}, {'_id': 0})
    if not o: raise HTTPException(404, "Not found")
    u = await db.users.find_one({'id': user_id}, {'_id': 0, 'password_hash': 0})
    gigs_count = await db.gigs.count_documents({'organizer_id': user_id})
    return {'user': user_public(u) if u else None, 'profile': o, 'gigs_count': gigs_count}

async def _optional_user(request: Request):
    """Return the authed user if a valid Bearer token is present, else None.
    Used by public endpoints that still want to know the viewer for permissions."""
    try:
        auth = request.headers.get('authorization', '')
        if not auth.startswith('Bearer '): return None
        token = auth.split(' ', 1)[1]
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        if payload.get('type') != 'access': return None
        u = await db.users.find_one({'id': payload['sub']}, {'_id': 0})
        return u
    except Exception:
        return None

@api.get("/profile/{user_id}")
async def get_unified_profile(user_id: str, request: Request):
    """Single unified profile payload. Returns the same shape whether the viewer
    is the owner, another logged-in user, or anonymous.

    Response includes: user, profile, stats, entities (with posts filtered by
    visibility for non-owners), reviews (with reviewer info), upcoming_events,
    achievements (derived), community_activity, permissions, viewer_relationship.
    The frontend renders identical layout and picks actions based on
    `permissions`; it should never branch on "own vs public"."""
    m = await _load_musician(user_id)
    if not m: raise HTTPException(404, "Profile not found")
    u = await db.users.find_one({'id': user_id}, {'_id': 0, 'password_hash': 0})
    if not u: raise HTTPException(404, "User not found")
    # Heal avatar desync: edit historically wrote avatar to musicians first.
    if not (u.get('avatar_url') or '').strip() and (m.get('avatar_url') or '').strip():
        u = {**u, 'avatar_url': m['avatar_url']}
        try:
            await db.users.update_one({'id': user_id}, {'$set': {'avatar_url': m['avatar_url']}})
        except Exception:
            pass
    viewer = await _optional_user(request)
    is_self = bool(viewer and viewer['id'] == user_id)

    # Stats
    reviews_raw = await db.reviews.find({'target_user_id': user_id}, {'_id': 0}).sort('created_at', -1).to_list(50)
    rating = round(sum(r['rating'] for r in reviews_raw) / len(reviews_raw), 1) if reviews_raw else 0.0
    reliability = min(100, 60 + len(reviews_raw) * 4)
    followers = await db.follows.count_documents({'target_user_id': user_id})
    following = await db.follows.count_documents({'follower_id': user_id})
    now_str = now_iso()
    completed_gigs = await db.applications.count_documents({
        'musician_id': user_id, 'status': 'accepted'
    })
    completed_gigs += await db.gigs.count_documents({
        'organizer_id': user_id, 'date': {'$lt': now_str[:10]}
    })

    # Entities (posts filtered by visibility unless owner)
    post_filter = {'author_id': user_id}
    if not is_self:
        post_filter = {'author_id': user_id, '$or': [
            {'visibility': 'public'}, {'visibility': {'$exists': False}}
        ]}
    posts_total = await db.posts.count_documents(post_filter)
    entities = {
        # Profile only needs a compact preview — full list is GET /users/{id}/posts
        'posts': await db.posts.find(post_filter, {'_id': 0}).sort('created_at', -1).limit(9).to_list(9),
        'posts_total': posts_total,
        'gigs': await db.gigs.find({'organizer_id': user_id}, {'_id': 0}).sort('date', -1).to_list(50),
        'bands': await db.bands.find({'owner_id': user_id}, {'_id': 0}).to_list(50),
        'equipment': await db.equipment.find({'owner_id': user_id}, {'_id': 0}).to_list(50),
        'studios': await db.studios.find({'owner_id': user_id}, {'_id': 0}).to_list(50),
        'lessons': await db.lessons.find({'teacher_id': user_id}, {'_id': 0}).to_list(50),
    }

    # Reviews with reviewer info (already-embedded fields used if present)
    reviews = []
    for r in reviews_raw[:10]:
        rev = dict(r)
        # If missing author name/avatar, fetch from users
        if not rev.get('author_name') and rev.get('author_id'):
            au = await db.users.find_one({'id': rev['author_id']}, {'_id': 0, 'full_name': 1, 'avatar_url': 1})
            if au:
                rev['author_name'] = au.get('full_name')
                rev['author_avatar'] = au.get('avatar_url')
        reviews.append(rev)

    # Upcoming events: future gigs that are still active (open or filled).
    # Cancelled gigs are excluded so they don't linger on profiles.
    today = now_str[:10]
    active_statuses = {'$in': ['open', 'filled']}
    org_upcoming = await db.gigs.find({
        'organizer_id': user_id, 'date': {'$gte': today}, 'status': active_statuses,
    }, {'_id': 0}).sort('date', 1).limit(5).to_list(5)
    mus_apps = await db.applications.find({
        'musician_id': user_id, 'status': 'accepted'
    }, {'_id': 0}).to_list(50)
    mus_gig_ids = [a['gig_id'] for a in mus_apps]
    mus_upcoming = await db.gigs.find({
        'id': {'$in': mus_gig_ids}, 'date': {'$gte': today}, 'status': active_statuses,
    }, {'_id': 0}).sort('date', 1).limit(5).to_list(5) if mus_gig_ids else []
    upcoming_events = sorted(org_upcoming + mus_upcoming, key=lambda g: g.get('date', ''))[:6]

    # Achievements (derived)
    achievements = []
    if u.get('verified'): achievements.append({'key': 'verified', 'label': 'Verified artist', 'icon': 'checkmark-circle'})
    if rating >= 4.5 and len(reviews_raw) >= 5:
        achievements.append({'key': 'top_rated', 'label': 'Top rated', 'icon': 'star'})
    if completed_gigs >= 10:
        achievements.append({'key': 'ten_gigs', 'label': f'{completed_gigs} gigs completed', 'icon': 'ribbon'})
    if followers >= 50:
        achievements.append({'key': 'popular', 'label': f'{followers}+ followers', 'icon': 'people'})
    if m.get('experience_years', 0) >= 5:
        achievements.append({'key': 'veteran', 'label': f'{m["experience_years"]}+ yrs experience', 'icon': 'trophy'})

    # Community activity — posts + engagement on this user's content
    # (likes/comments received), plus outbound likes/comments given.
    user_post_ids = [p['id'] for p in await db.posts.find(
        {'author_id': user_id}, {'_id': 0, 'id': 1}
    ).to_list(5000)]
    likes_received = await db.likes.count_documents({'post_id': {'$in': user_post_ids}}) if user_post_ids else 0
    comments_received = await db.comments.count_documents({'post_id': {'$in': user_post_ids}}) if user_post_ids else 0
    likes_given = await db.likes.count_documents({'user_id': user_id})
    comments_given = await db.comments.count_documents({'author_id': user_id})
    community_activity = {
        'posts_count': posts_total,
        'likes_received': likes_received,
        'comments_received': comments_received,
        'likes_given': likes_given,
        'comments_given': comments_given,
    }

    # Permissions — the frontend renders identical layout and only branches action buttons on this.
    is_organizer = bool(viewer and 'organizer' in (viewer.get('roles') or []))
    is_following = False
    if viewer and not is_self:
        is_following = bool(await db.follows.find_one({
            'follower_id': viewer['id'], 'target_user_id': user_id
        }))
    permissions = {
        'can_edit': is_self,
        'can_open_settings': is_self,
        'can_switch_role': is_self and len(u.get('roles') or []) > 1,
        'can_create_post': is_self,
        'can_view_analytics': is_self,
        'can_delete_content': is_self,
        'can_follow': (not is_self) and bool(viewer),
        'can_message': (not is_self) and bool(viewer),
        'can_hire': (not is_self) and is_organizer,
        'can_share': True,
        'can_report': (not is_self) and bool(viewer),
    }
    viewer_relationship = {
        'is_self': is_self,
        'is_following': is_following,
        'viewer_id': viewer['id'] if viewer else None,
    }

    return {
        'user': user_public(u),
        'profile': _public_profile(m, is_self),
        'stats': {
            'followers': followers, 'following': following,
            'completed_gigs': completed_gigs,
            'reviews_count': len(reviews_raw), 'rating': rating,
            'reliability': reliability,
        },
        'entities': entities,
        'reviews': reviews,
        'upcoming_events': upcoming_events,
        'achievements': achievements,
        'community_activity': community_activity,
        'permissions': permissions,
        'viewer_relationship': viewer_relationship,
    }

# ================== Directory / Discover ==================
@api.get("/musicians")
async def list_musicians(city: Optional[str] = None, genre: Optional[str] = None,
                         instrument: Optional[str] = None, q: Optional[str] = None,
                         featured: Optional[bool] = None, limit: int = 50):
    query = {**_city_query(city)}
    if genre and genre != 'All': query['genres'] = {'$in': [genre]}
    if instrument and instrument != 'All': query['instruments'] = {'$in': [instrument]}
    docs = await db.musicians.find(query, {'_id': 0}).limit(limit).to_list(limit)
    out = []
    for m in docs:
        u = await db.users.find_one({'id': m['user_id']}, {'_id': 0, 'password_hash': 0})
        if not u: continue
        if q:
            blob = ' '.join([
                u.get('full_name') or '',
                ' '.join(m.get('genres') or []),
                ' '.join(m.get('instruments') or []),
                ' '.join(m.get('skills') or []),
                ' '.join(m.get('professions') or []),
                m.get('tagline') or '',
                m.get('bio') or '',
            ]).lower()
            if q.lower() not in blob:
                continue
        out.append({'user': user_public(u), 'profile': _public_profile(m, is_self=False)})
    return out

@api.get("/organizers")
async def list_organizers(q: Optional[str] = None, limit: int = 50):
    docs = await db.organizers.find({}, {'_id': 0}).limit(limit).to_list(limit)
    out = []
    for o in docs:
        u = await db.users.find_one({'id': o['user_id']}, {'_id': 0, 'password_hash': 0})
        if not u: continue
        if q and q.lower() not in (u['full_name'] + ' ' + o.get('org_name', '')).lower(): continue
        out.append({'user': user_public(u), 'profile': o})
    return out

@api.get("/venues")
async def list_venues(city: Optional[str] = None, q: Optional[str] = None, limit: int = 50):
    query = {**_city_query(city)}
    if q: query['name'] = {'$regex': q, '$options': 'i'}
    return await db.venues.find(query, {'_id': 0}).limit(limit).to_list(limit)

@api.get("/venues/{vid}")
async def get_venue(vid: str):
    return await _get_entity_detail(db.venues, vid, owner_key='owner_id', cover_kind='venue')

# ================== Gigs ==================
@api.post("/gigs")
async def create_gig(inp: GigCreate, u=Depends(get_user)):
    # Action-based: any user can post a hiring gig
    gid = str(uuid.uuid4())
    doc = inp.dict()
    doc['cover_url'] = _default_cover('gig', doc.get('cover_url'))
    doc.update({'id': gid, 'organizer_id': u['id'], 'status': 'open',
                'created_at': now_iso(), 'featured': False})
    await db.gigs.insert_one(doc)
    doc.pop('_id', None)
    AnalyticsService.schedule(u['id'], "gig_created", entity_type="gig", entity_id=gid)
    AnalyticsService.schedule(u['id'], "first_gig", entity_type="gig", entity_id=gid, metadata={"funnel": True})
    return doc

@api.get("/gigs")
async def list_gigs(city: Optional[str] = None, genre: Optional[str] = None,
                    instrument: Optional[str] = None, event_type: Optional[str] = None,
                    min_budget: Optional[int] = None, max_budget: Optional[int] = None,
                    q: Optional[str] = None, limit: int = 100):
    query = {'status': 'open', **_city_query(city)}
    if genre and genre != 'All': query['genre'] = genre
    if instrument and instrument != 'All': query['instrument_needed'] = instrument
    if event_type and event_type != 'All': query['event_type'] = event_type
    if min_budget is not None: query['budget'] = {'$gte': min_budget}
    if max_budget is not None: query.setdefault('budget', {})['$lte'] = max_budget
    if q:
        rx = {'$regex': q, '$options': 'i'}
        query['$or'] = [
            {'title': rx},
            {'description': rx},
            {'instrument_needed': rx},
            {'genre': rx},
            {'event_type': rx},
        ]
    return await db.gigs.find(query, {'_id': 0}).sort('featured', -1).limit(limit).to_list(limit)

@api.get("/gigs/{gid}")
async def get_gig(gid: str):
    g = await db.gigs.find_one({'id': gid}, {'_id': 0})
    if not g: raise HTTPException(404, "Not found")
    org_user = await db.users.find_one({'id': g['organizer_id']}, {'_id': 0, 'password_hash': 0})
    org_profile = await db.organizers.find_one({'user_id': g['organizer_id']}, {'_id': 0})
    apps_count = await db.applications.count_documents({'gig_id': gid})
    contact = await _owner_contact(g.get('organizer_id'))
    accepted = None
    mid = g.get('accepted_musician_id')
    if mid:
        mu = await db.users.find_one({'id': mid}, {'_id': 0, 'password_hash': 0})
        mp = await db.musicians.find_one({'user_id': mid}, {'_id': 0})
        if mu:
            accepted = {'user': user_public(mu), 'profile': mp}
    return {
        'gig': g,
        'organizer_user': user_public(org_user) if org_user else None,
        'organizer_profile': org_profile,
        'applications_count': apps_count,
        'contact': contact,
        'accepted_collaborator': accepted,
    }

@api.get("/gigs/mine/list")
async def my_gigs(u=Depends(get_user)):
    docs = await db.gigs.find({'organizer_id': u['id']}, {'_id': 0}).to_list(200)
    for g in docs:
        g['applications_count'] = await db.applications.count_documents({'gig_id': g['id']})
    return docs

# ================== Applications ==================
@api.post("/applications")
async def apply(inp: ApplicationIn, u=Depends(get_user)):
    # Action-based: any user can apply
    g = await db.gigs.find_one({'id': inp.gig_id})
    if not g: raise HTTPException(404, "Gig not found")
    if g.get('status') != 'open':
        raise HTTPException(400, "This gig is no longer open for collaboration")
    if g.get('organizer_id') == u['id']:
        raise HTTPException(400, "Cannot apply to your own gig")
    existing = await db.applications.find_one(
        {'gig_id': inp.gig_id, 'musician_id': u['id']}, {'_id': 0}
    )
    if existing:
        # Allow re-request after withdraw / decline when gig is open again
        if existing.get('status') in ('withdrawn', 'rejected'):
            ts = now_iso()
            await db.applications.update_one(
                {'id': existing['id']},
                {'$set': {
                    'status': 'pending',
                    'message': inp.message,
                    'updated_at': ts,
                }},
            )
            NotificationService.gig_application(g['organizer_id'], u, g)
            AnalyticsService.schedule(u['id'], "gig_applied", entity_type="gig", entity_id=g['id'])
            return await db.applications.find_one({'id': existing['id']}, {'_id': 0})
        raise HTTPException(400, "Already applied")
    aid = str(uuid.uuid4())
    doc = {'id': aid, 'gig_id': inp.gig_id, 'musician_id': u['id'],
           'message': inp.message, 'status': 'pending', 'created_at': now_iso()}
    await db.applications.insert_one(doc)
    doc.pop('_id', None)
    NotificationService.gig_application(g['organizer_id'], u, g)
    AnalyticsService.schedule(u['id'], "gig_applied", entity_type="gig", entity_id=g['id'])
    return doc

@api.get("/applications/mine")
async def my_apps(u=Depends(get_user)):
    docs = await db.applications.find({'musician_id': u['id']}, {'_id': 0}).sort('created_at', -1).to_list(100)
    out = []
    for a in docs:
        g = await db.gigs.find_one({'id': a['gig_id']}, {'_id': 0})
        if g: out.append({'application': a, 'gig': g})
    return out

@api.get("/applications/gig/{gid}")
async def gig_apps(gid: str, u=Depends(get_user)):
    g = await db.gigs.find_one({'id': gid})
    if not g or g['organizer_id'] != u['id']:
        raise HTTPException(403, "Not allowed")
    apps = await db.applications.find({'gig_id': gid}, {'_id': 0}).sort('created_at', -1).to_list(200)
    out = []
    for a in apps:
        mu = await db.users.find_one({'id': a['musician_id']}, {'_id': 0, 'password_hash': 0})
        mp = await db.musicians.find_one({'user_id': a['musician_id']}, {'_id': 0})
        out.append({'application': a, 'musician_user': user_public(mu) if mu else None, 'musician_profile': mp})
    return out

@api.post("/applications/{aid}/accept")
async def accept_application(aid: str, u=Depends(get_user)):
    """Accept one collaborator: fill the gig and reject all other pending requests."""
    app = await db.applications.find_one({'id': aid}, {'_id': 0})
    if not app: raise HTTPException(404, "Application not found")
    g = await db.gigs.find_one({'id': app['gig_id']}, {'_id': 0})
    if not g: raise HTTPException(404, "Gig not found")
    if g['organizer_id'] != u['id']:
        raise HTTPException(403, "Not allowed")
    if g.get('status') != 'open':
        raise HTTPException(400, "Gig is already filled")
    if app.get('status') != 'pending':
        raise HTTPException(400, "Application is not pending")

    ts = now_iso()
    await db.applications.update_one({'id': aid}, {'$set': {'status': 'accepted', 'updated_at': ts}})
    await db.applications.update_many(
        {'gig_id': g['id'], 'id': {'$ne': aid}, 'status': 'pending'},
        {'$set': {'status': 'rejected', 'updated_at': ts}},
    )
    await db.gigs.update_one(
        {'id': g['id']},
        {'$set': {
            'status': 'filled',
            'filled_at': ts,
            'accepted_application_id': aid,
            'accepted_musician_id': app['musician_id'],
        }},
    )
    updated = await db.applications.find_one({'id': aid}, {'_id': 0})
    gig = await db.gigs.find_one({'id': g['id']}, {'_id': 0})
    NotificationService.gig_accepted(app['musician_id'], u, g)
    AnalyticsService.schedule(u['id'], "gig_accepted", entity_type="gig", entity_id=g['id'],
                              metadata={'musician_id': app['musician_id']})
    return {'application': updated, 'gig': gig}

@api.post("/applications/{aid}/reject")
async def reject_application(aid: str, u=Depends(get_user)):
    """Reject a single collaboration request without filling the gig."""
    app = await db.applications.find_one({'id': aid}, {'_id': 0})
    if not app: raise HTTPException(404, "Application not found")
    g = await db.gigs.find_one({'id': app['gig_id']}, {'_id': 0})
    if not g: raise HTTPException(404, "Gig not found")
    if g['organizer_id'] != u['id']:
        raise HTTPException(403, "Not allowed")
    if app.get('status') != 'pending':
        raise HTTPException(400, "Application is not pending")
    await db.applications.update_one(
        {'id': aid},
        {'$set': {'status': 'rejected', 'updated_at': now_iso()}},
    )
    updated = await db.applications.find_one({'id': aid}, {'_id': 0})
    NotificationService.gig_rejected(app['musician_id'], u, g)
    return {'application': updated}

@api.post("/applications/{aid}/revoke")
async def revoke_application(aid: str, u=Depends(get_user)):
    """Organizer or accepted collaborator ends the collaboration and reopens the gig."""
    app = await db.applications.find_one({'id': aid}, {'_id': 0})
    if not app: raise HTTPException(404, "Application not found")
    g = await db.gigs.find_one({'id': app['gig_id']}, {'_id': 0})
    if not g: raise HTTPException(404, "Gig not found")
    if app.get('status') != 'accepted':
        raise HTTPException(400, "Only an accepted collaboration can be revoked")
    if g.get('status') == 'cancelled':
        raise HTTPException(400, "This gig was cancelled")
    is_org = g.get('organizer_id') == u['id']
    is_collab = app.get('musician_id') == u['id']
    if not (is_org or is_collab):
        raise HTTPException(403, "Not allowed")

    ts = now_iso()
    await db.applications.update_one(
        {'id': aid},
        {'$set': {
            'status': 'withdrawn',
            'updated_at': ts,
            'revoked_by': u['id'],
            'revoked_at': ts,
        }},
    )
    await db.gigs.update_one(
        {'id': g['id']},
        {
            '$set': {'status': 'open', 'updated_at': ts},
            '$unset': {
                'filled_at': '',
                'accepted_application_id': '',
                'accepted_musician_id': '',
            },
        },
    )
    updated = await db.applications.find_one({'id': aid}, {'_id': 0})
    gig = await db.gigs.find_one({'id': g['id']}, {'_id': 0})
    return {'application': updated, 'gig': gig}

@api.post("/gigs/{gid}/cancel")
async def cancel_gig(gid: str, u=Depends(get_user)):
    """Organizer cancels a gig. Removes it from upcoming profiles and discover."""
    g = await db.gigs.find_one({'id': gid}, {'_id': 0})
    if not g: raise HTTPException(404, "Not found")
    if g.get('organizer_id') != u['id']:
        raise HTTPException(403, "Only the organizer can cancel this gig")
    if g.get('status') == 'cancelled':
        return g
    ts = now_iso()
    await db.gigs.update_one(
        {'id': gid},
        {'$set': {
            'status': 'cancelled',
            'cancelled_at': ts,
            'updated_at': ts,
        }},
    )
    # Close out pending requests; leave accepted as historical record
    await db.applications.update_many(
        {'gig_id': gid, 'status': 'pending'},
        {'$set': {'status': 'rejected', 'updated_at': ts, 'reject_reason': 'gig_cancelled'}},
    )
    # Notify accepted collaborator if any
    mid = g.get('accepted_musician_id')
    if mid:
        NotificationService.gig_cancelled(mid, u, g)
    apps = await db.applications.find({'gig_id': gid, 'status': 'accepted'}, {'_id': 0}).to_list(20)
    for a in apps:
        if a.get('musician_id') and a['musician_id'] != mid:
            NotificationService.gig_cancelled(a['musician_id'], u, g)
    AnalyticsService.schedule(u['id'], "gig_cancelled", entity_type="gig", entity_id=gid)
    return await db.gigs.find_one({'id': gid}, {'_id': 0})

# ================== Reviews ==================
@api.post("/reviews")
async def create_review(inp: ReviewIn, u=Depends(get_user)):
    doc = {'id': str(uuid.uuid4()), 'author_id': u['id'], 'target_user_id': inp.target_user_id,
           'rating': inp.rating, 'comment': inp.comment, 'author_name': u['full_name'],
           'created_at': now_iso()}
    await db.reviews.insert_one(doc)
    doc.pop('_id', None)
    return doc

# ================== Messages ==================
def thread_key(a: str, b: str) -> str:
    return '::'.join(sorted([a, b]))

@api.get("/threads")
async def threads(u=Depends(get_user)):
    msgs = await db.messages.find({'$or': [{'from_id': u['id']}, {'to_id': u['id']}]}, {'_id': 0}).sort('created_at', -1).to_list(500)
    groups: dict = {}
    for m in msgs:
        other = m['to_id'] if m['from_id'] == u['id'] else m['from_id']
        if other not in groups: groups[other] = m
    out = []
    for other, last in groups.items():
        ou = await db.users.find_one({'id': other}, {'_id': 0, 'password_hash': 0})
        if not ou: continue
        unread = await db.messages.count_documents({'from_id': other, 'to_id': u['id'], 'read': False})
        out.append({'user': user_public(ou), 'last_message': last, 'unread': unread})
    out.sort(key=lambda t: t['last_message']['created_at'], reverse=True)
    return out

@api.get("/threads/{other_id}")
async def thread_detail(other_id: str, u=Depends(get_user)):
    msgs = await db.messages.find({
        '$or': [{'from_id': u['id'], 'to_id': other_id},
                {'from_id': other_id, 'to_id': u['id']}]
    }, {'_id': 0}).sort('created_at', 1).to_list(500)
    await db.messages.update_many({'from_id': other_id, 'to_id': u['id'], 'read': False},
                                  {'$set': {'read': True}})
    ou = await db.users.find_one({'id': other_id}, {'_id': 0, 'password_hash': 0})
    return {'other': user_public(ou) if ou else None, 'messages': msgs}

@api.post("/messages")
async def send_msg(inp: MessageIn, u=Depends(get_user)):
    if not inp.to_user_id: raise HTTPException(400, "to_user_id required")
    if not inp.text.strip(): raise HTTPException(400, "Empty message")
    m = {'id': str(uuid.uuid4()), 'from_id': u['id'], 'to_id': inp.to_user_id,
         'text': inp.text.strip(), 'read': False, 'created_at': now_iso()}
    await db.messages.insert_one(m)
    m.pop('_id', None)
    preview = (inp.text.strip()[:80] + ("…" if len(inp.text.strip()) > 80 else ""))
    NotificationService.new_message(inp.to_user_id, u, preview)
    AnalyticsService.schedule(u['id'], "message_sent", entity_type="user", entity_id=inp.to_user_id)
    return m

# ================== AI ==================
async def call_llm(system: str, prompt: str) -> str:
    if not EMERGENT_LLM_KEY:
        return "AI unavailable. Add EMERGENT_LLM_KEY to backend .env."
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=str(uuid.uuid4()),
                       system_message=system).with_model("gemini", "gemini-2.5-flash")
        resp = await chat.send_message(UserMessage(text=prompt))
        return str(resp).strip()
    except Exception as e:
        logging.exception("LLM error")
        return f"AI temporarily unavailable ({type(e).__name__})."

@api.post("/ai/bio")
async def ai_bio(inp: AIBioIn, u=Depends(get_user)):
    m = await db.musicians.find_one({'user_id': u['id']}, {'_id': 0}) or {}
    prompt = (f"Generate a compelling {inp.tone} bio (110-140 words) for a live musician. "
              f"Name: {u['full_name']}. City: {m.get('city','')}. "
              f"Genres: {', '.join(m.get('genres',[]) or ['multi-genre'])}. "
              f"Instruments: {', '.join(m.get('instruments',[]) or ['vocals'])}. "
              f"Experience: {m.get('experience_years',0)} years. "
              "Write in first person, natural and confident. No emojis. No hashtags.")
    text = await call_llm("You are a music industry copywriter crafting elegant artist bios.", prompt)
    return {'bio': text}

@api.post("/ai/pricing")
async def ai_pricing(inp: AIPricingIn, u=Depends(get_user)):
    prompt = (f"Suggest hourly pricing (INR) for a live musician in {inp.city}, "
              f"{inp.experience_years} yrs exp, genres {inp.genres}, instruments {inp.instruments}. "
              "Reply strict minified JSON: {min:int,max:int,recommended:int,reasoning:string}. INR/hour.")
    text = await call_llm("You are a live music market analyst for India. Return ONLY minified JSON.", prompt)
    import json as _json, re
    try:
        cleaned = re.sub(r'^```(?:json)?|```$', '', text.strip(), flags=re.MULTILINE).strip()
        data = _json.loads(cleaned)
    except:
        data = {'min': 2000, 'max': 8000, 'recommended': 4500,
                'reasoning': 'Estimate based on typical live-gig rates.'}
    return data

@api.post("/ai/recommendations")
async def ai_recos(u=Depends(get_user)):
    m = await db.musicians.find_one({'user_id': u['id']}) or {}
    q = {'status': 'open'}
    if m.get('city'): q['city'] = m['city']
    gigs = await db.gigs.find(q, {'_id': 0}).limit(50).to_list(50)
    if not gigs:
        gigs = await db.gigs.find({'status': 'open'}, {'_id': 0}).limit(50).to_list(50)
    scored = []
    for g in gigs:
        score = 0
        if g['genre'] in (m.get('genres') or []): score += 3
        if g['instrument_needed'] in (m.get('instruments') or []): score += 3
        if g['city'].lower() == (m.get('city') or '').lower(): score += 2
        scored.append((score, g))
    scored.sort(key=lambda x: -x[0])
    out = []
    for _, g in scored[:5]:
        g = dict(g)
        g['cover_url'] = _default_cover('gig', g.get('cover_url'))
        out.append(g)
    return out

@api.post("/ai/contract/{gig_id}")
async def ai_contract(gig_id: str, u=Depends(get_user)):
    g = await db.gigs.find_one({'id': gig_id}, {'_id': 0})
    if not g: raise HTTPException(404, "Gig not found")
    prompt = (f"Draft a concise performance contract (bullet list, 8-10 clauses) for '{g['title']}' "
              f"on {g['date']} in {g['city']} ({g['event_type']}) budget INR {g['budget']}. "
              "Cover: schedule, payment (50/50), equipment, cancellation, recording rights, "
              "force majeure, hospitality, dress code. Plain text, no markdown.")
    text = await call_llm("You are a live-events lawyer drafting fair, artist-friendly contracts.", prompt)
    return {'contract': text}

@api.post("/ai/profile-review")
async def ai_profile_review(u=Depends(get_user)):
    m = await db.musicians.find_one({'user_id': u['id']}, {'_id': 0}) or {}
    fields = ['bio', 'city', 'genres', 'instruments', 'experience_years', 'pricing_per_hour', 'demo_video_url']
    missing = [f for f in fields if not m.get(f)]
    score = int(((len(fields) - len(missing)) / len(fields)) * 100)
    prompt = (f"Give 3 short career tips (1 line each) for a musician: {m.get('city','')}, "
              f"{m.get('experience_years',0)} yrs, genres {m.get('genres', [])}. "
              "Return plain text numbered list.")
    tips = await call_llm("You are a friendly career coach for musicians. Be brief and concrete.", prompt)
    return {'completion_score': score, 'missing_fields': missing, 'tips': tips}

# ================== Home / Dashboard ==================
@api.get("/home")
async def home(u=Depends(get_user)):
    role = u.get('active_role')
    if role == 'organizer':
        my_gigs_ = await db.gigs.find({'organizer_id': u['id']}, {'_id': 0}).sort('created_at', -1).to_list(20)
        total_apps = 0
        for g in my_gigs_:
            g['applications_count'] = await db.applications.count_documents({'gig_id': g['id']})
            total_apps += g['applications_count']
        # top musicians for hire
        top = await db.musicians.find({}, {'_id': 0}).limit(6).to_list(6)
        featured_musicians = []
        for m in top:
            ux = await db.users.find_one({'id': m['user_id']}, {'_id': 0, 'password_hash': 0})
            if ux: featured_musicians.append({'user': user_public(ux), 'profile': _public_profile(m, is_self=False)})
        return {
            'role': 'organizer',
            'metrics': {'active_gigs': len([g for g in my_gigs_ if g['status'] == 'open']),
                        'total_gigs': len(my_gigs_), 'total_applications': total_apps},
            'my_gigs': my_gigs_[:5],
            'featured_musicians': featured_musicians,
        }
    else:
        m = await db.musicians.find_one({'user_id': u['id']}, {'_id': 0}) or {}
        # recommendations
        q = {'status': 'open'}
        if m.get('city'): q['city'] = m['city']
        gigs = await db.gigs.find(q, {'_id': 0}).limit(30).to_list(30)
        if not gigs:
            gigs = await db.gigs.find({'status': 'open'}, {'_id': 0}).limit(30).to_list(30)
        scored = []
        for g in gigs:
            score = 0
            if g['genre'] in (m.get('genres') or []): score += 3
            if g['instrument_needed'] in (m.get('instruments') or []): score += 3
            scored.append((score, g))
        scored.sort(key=lambda x: -x[0])
        recos = [g for _, g in scored[:6]]
        # upcoming bookings (accepted apps)
        apps = await db.applications.find({'musician_id': u['id'], 'status': 'accepted'}, {'_id': 0}).to_list(20)
        upcoming = []
        for a in apps:
            g = await db.gigs.find_one({'id': a['gig_id']}, {'_id': 0})
            if g: upcoming.append(g)
        reviews = await db.reviews.find({'target_user_id': u['id']}).to_list(200)
        rating = round(sum(r['rating'] for r in reviews) / len(reviews), 1) if reviews else 0
        # profile completion
        fields = ['bio', 'city', 'genres', 'instruments', 'experience_years', 'pricing_per_hour']
        completion = int(sum(1 for f in fields if m.get(f)) / len(fields) * 100)
        return {
            'role': 'musician',
            'metrics': {'applications': await db.applications.count_documents({'musician_id': u['id']}),
                        'rating': rating, 'followers': await db.follows.count_documents({'target_user_id': u['id']}),
                        'profile_completion': completion},
            'recommendations': recos,
            'upcoming': upcoming,
            'trending_venues': await db.venues.find({}, {'_id': 0}).limit(5).to_list(5),
        }

@api.get("/dashboard")
async def dashboard(u=Depends(get_user)):
    if u.get('active_role') == 'organizer':
        gigs = await db.gigs.find({'organizer_id': u['id']}, {'_id': 0}).to_list(500)
        total_apps = 0
        for g in gigs:
            total_apps += await db.applications.count_documents({'gig_id': g['id']})
        return {'active_gigs': len([g for g in gigs if g['status'] == 'open']),
                'total_gigs': len(gigs), 'total_applications': total_apps,
                'total_budget': sum(g['budget'] for g in gigs)}
    apps = await db.applications.find({'musician_id': u['id']}).to_list(500)
    reviews = await db.reviews.find({'target_user_id': u['id']}).to_list(500)
    rating = round(sum(r['rating'] for r in reviews) / len(reviews), 1) if reviews else 0
    return {'total_applications': len(apps),
            'pending': len([a for a in apps if a['status'] == 'pending']),
            'accepted': len([a for a in apps if a['status'] == 'accepted']),
            'rating': rating, 'reviews': len(reviews)}

# ================== Root ==================
@api.get("/")
async def root():
    return {'app': 'gigZee API', 'version': '2.0'}

@app.get("/health")
async def health():
    """Liveness + optional maintenance flag for the mobile app gate."""
    if os.environ.get('MAINTENANCE_MODE', '').lower() in ('1', 'true', 'yes'):
        return JSONResponse(
            {
                'ok': False,
                'status': 'maintenance',
                'message': os.environ.get(
                    'MAINTENANCE_MESSAGE',
                    'gigZee is under maintenance. Please try again shortly.',
                ),
            },
            status_code=503,
        )
    return {'ok': True, 'status': 'ok'}

# ================== App config (editable without app release) ==================
class OnboardingConfigIn(BaseModel):
    cities: Optional[List[str]] = None
    default_city: Optional[str] = None
    city_note: Optional[str] = None
    interests_prompt: Optional[str] = None
    interests: Optional[List[str]] = None

async def _load_onboarding_config() -> dict:
    doc = await db.config.find_one({'id': 'onboarding'}, {'_id': 0})
    out = dict(DEFAULT_ONBOARDING_CONFIG)
    if doc:
        for k in ('cities', 'default_city', 'city_note', 'interests_prompt', 'interests'):
            if doc.get(k) is not None:
                out[k] = doc[k]
    # Keep default_city inside cities
    cities = out.get('cities') or [ALLOWED_CITY]
    if not isinstance(cities, list) or not cities:
        cities = [ALLOWED_CITY]
    out['cities'] = cities
    if out.get('default_city') not in cities:
        out['default_city'] = cities[0]
    return out

@api.get("/config/onboarding")
async def get_onboarding_config():
    """Public — powers onboarding chips so cities/interests can change without an app release."""
    return await _load_onboarding_config()

@api.put("/config/onboarding")
async def put_onboarding_config(inp: OnboardingConfigIn, u=Depends(get_user)):
    """Update onboarding options (cities, interests, copy). Partial update supported."""
    patch = {k: v for k, v in inp.dict(exclude_unset=True).items() if v is not None}
    if not patch:
        return await _load_onboarding_config()
    if 'cities' in patch:
        cities = [c.strip() for c in patch['cities'] if isinstance(c, str) and c.strip()]
        if not cities:
            raise HTTPException(400, "cities must include at least one city")
        patch['cities'] = cities
    if 'interests' in patch:
        patch['interests'] = [i.strip() for i in patch['interests'] if isinstance(i, str) and i.strip()]
    patch['id'] = 'onboarding'
    patch['updated_at'] = now_iso()
    patch['updated_by'] = u['id']
    await db.config.update_one({'id': 'onboarding'}, {'$set': patch}, upsert=True)
    return await _load_onboarding_config()

PROFILE_OPTION_KEYS = ('professions', 'skills', 'genres', 'instruments', 'languages', 'pricing_types')

class ProfileOptionsIn(BaseModel):
    professions: Optional[List[str]] = None
    skills: Optional[List[str]] = None
    genres: Optional[List[str]] = None
    instruments: Optional[List[str]] = None
    languages: Optional[List[str]] = None
    pricing_types: Optional[List[str]] = None

def _clean_str_list(vals) -> List[str]:
    if not isinstance(vals, list):
        return []
    out, seen = [], set()
    for v in vals:
        if not isinstance(v, str):
            continue
        s = v.strip()
        if not s or s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out

async def _load_profile_options() -> dict:
    doc = await db.config.find_one({'id': 'profile_options'}, {'_id': 0})
    out = dict(DEFAULT_PROFILE_OPTIONS)
    if doc:
        for k in PROFILE_OPTION_KEYS:
            cleaned = _clean_str_list(doc.get(k))
            if cleaned:
                out[k] = cleaned
    return out

@api.get("/config/profile-options")
async def get_profile_options():
    """Public — chip lists for edit profile (and related forms). Editable without an app release."""
    return await _load_profile_options()

@api.put("/config/profile-options")
async def put_profile_options(inp: ProfileOptionsIn, u=Depends(get_user)):
    """Update professions / skills / genres / instruments / languages. Partial update supported."""
    patch = {}
    raw = inp.dict(exclude_unset=True)
    for k in PROFILE_OPTION_KEYS:
        if k not in raw or raw[k] is None:
            continue
        cleaned = _clean_str_list(raw[k])
        if not cleaned:
            raise HTTPException(400, f"{k} must include at least one value")
        patch[k] = cleaned
    if not patch:
        return await _load_profile_options()
    patch['id'] = 'profile_options'
    patch['updated_at'] = now_iso()
    patch['updated_by'] = u['id']
    await db.config.update_one({'id': 'profile_options'}, {'$set': patch}, upsert=True)
    return await _load_profile_options()

# ================== Entities: Bands / Equipment / Studios / Lessons ==================
async def _list_entity(coll, city, q, category=None, listing_type=None, limit=100):
    query = {**_city_query(city)}
    if category: query['category'] = category
    if listing_type: query['listing_type'] = listing_type
    if q:
        rx = {'$regex': q, '$options': 'i'}
        query['$or'] = [
            {'title': rx},
            {'name': rx},
            {'description': rx},
            {'category': rx},
            {'subject': rx},
            {'instrument_needed': rx},
        ]
    return await coll.find(query, {'_id': 0}).sort('created_at', -1).limit(limit).to_list(limit)

async def _owner_contact(owner_id: Optional[str]) -> dict:
    """Public contact for a listing owner — phone hidden unless explicitly public."""
    if not owner_id:
        return {'phone': None, 'hide_contact': True}
    m = await db.musicians.find_one({'user_id': owner_id}, {'_id': 0, 'phone': 1, 'hide_contact': 1}) or {}
    # Opt-in: only expose phone when hide_contact is explicitly False
    if m.get('hide_contact') is not False:
        return {'phone': None, 'hide_contact': True}
    phone = m.get('phone')
    return {'phone': phone if phone else None, 'hide_contact': False}

async def _get_entity_detail(coll, eid: str, owner_key: str = 'owner_id', cover_kind: str = 'gig'):
    d = await coll.find_one({'id': eid}, {'_id': 0})
    if not d:
        raise HTTPException(404, "Not found")
    d['cover_url'] = _default_cover(cover_kind, d.get('cover_url'), d.get('images'))
    owner_id = d.get(owner_key)
    owner = None
    contact = {'phone': None, 'hide_contact': True}
    if owner_id:
        u = await db.users.find_one({'id': owner_id}, {'_id': 0, 'password_hash': 0})
        owner = user_public(u) if u else None
        contact = await _owner_contact(owner_id)
    return {'item': d, 'owner': owner, 'contact': contact}

@api.post("/bands")
async def create_band(inp: BandIn, u=Depends(get_user)):
    bid = str(uuid.uuid4())
    data = inp.dict()
    data['cover_url'] = _default_cover('band', data.get('cover_url'))
    doc = {**data, 'id': bid, 'owner_id': u['id'], 'created_at': now_iso(),
           'members': [u['id']]}
    await db.bands.insert_one(doc)
    doc.pop('_id', None)
    AnalyticsService.schedule(u['id'], "band_created", entity_type="band", entity_id=bid)
    AnalyticsService.schedule(u['id'], "first_band", entity_type="band", entity_id=bid, metadata={"funnel": True})
    return doc

@api.get("/bands")
async def list_bands(city: Optional[str] = None, q: Optional[str] = None):
    return await _list_entity(db.bands, city, q)

@api.get("/bands/{bid}")
async def get_band(bid: str):
    return await _get_entity_detail(db.bands, bid, owner_key='owner_id', cover_kind='band')

@api.patch("/bands/{bid}")
async def patch_band(bid: str, inp: BandIn, u=Depends(get_user)):
    doc = await db.bands.find_one({'id': bid})
    if not doc: raise HTTPException(404, "Not found")
    if doc.get('owner_id') != u['id']: raise HTTPException(403, "Not yours to edit")
    data = inp.dict()
    data['cover_url'] = _default_cover('band', data.get('cover_url') or doc.get('cover_url'))
    data['updated_at'] = now_iso()
    await db.bands.update_one({'id': bid}, {'$set': data})
    out = await db.bands.find_one({'id': bid}, {'_id': 0})
    return out

@api.post("/equipment")
async def create_equipment(inp: EquipmentIn, u=Depends(get_user)):
    eid = str(uuid.uuid4())
    images = list(inp.images or [])
    cover = _default_cover('equipment', inp.cover_url, images)
    if cover and cover not in images and not cover.startswith('https://images.unsplash.com'):
        images = [cover] + images
    if len(images) > EQUIPMENT_MAX_IMAGES:
        raise HTTPException(400, f"Max {EQUIPMENT_MAX_IMAGES} images allowed")
    doc = {
        **inp.dict(),
        'id': eid,
        'owner_id': u['id'],
        'created_at': now_iso(),
        'images': images,
        'cover_url': cover,
    }
    await db.equipment.insert_one(doc)
    doc.pop('_id', None)
    AnalyticsService.schedule(u['id'], "equipment_listed", entity_type="equipment", entity_id=eid)
    return doc

@api.get("/equipment")
async def list_equipment(city: Optional[str] = None, q: Optional[str] = None,
                          category: Optional[str] = None,
                          listing_type: Optional[str] = None):
    return await _list_entity(db.equipment, city, q, category=category, listing_type=listing_type)

@api.get("/equipment/{eid}")
async def get_equipment(eid: str):
    return await _get_entity_detail(db.equipment, eid, owner_key='owner_id', cover_kind='equipment')

@api.patch("/equipment/{eid}")
async def patch_equipment(eid: str, inp: EquipmentIn, u=Depends(get_user)):
    doc = await db.equipment.find_one({'id': eid})
    if not doc: raise HTTPException(404, "Not found")
    if doc.get('owner_id') != u['id']: raise HTTPException(403, "Not yours to edit")
    images = list(inp.images or [])
    cover = _default_cover('equipment', inp.cover_url or doc.get('cover_url'), images)
    if cover and cover not in images and not str(cover).startswith('https://images.unsplash.com'):
        images = [cover] + images
    if len(images) > EQUIPMENT_MAX_IMAGES:
        raise HTTPException(400, f"Max {EQUIPMENT_MAX_IMAGES} images allowed")
    data = {**inp.dict(), 'images': images, 'cover_url': cover, 'updated_at': now_iso()}
    await db.equipment.update_one({'id': eid}, {'$set': data})
    return await db.equipment.find_one({'id': eid}, {'_id': 0})

@api.post("/studios")
async def create_studio(inp: StudioIn, u=Depends(get_user)):
    sid = str(uuid.uuid4())
    images = list(inp.images or [])
    cover = _default_cover('studio', inp.cover_url, images)
    if cover and cover not in images and not cover.startswith('https://images.unsplash.com'):
        images = [cover] + images
    if len(images) > STUDIO_MAX_IMAGES:
        raise HTTPException(400, f"Max {STUDIO_MAX_IMAGES} images allowed")
    doc = {
        **inp.dict(),
        'id': sid,
        'owner_id': u['id'],
        'created_at': now_iso(),
        'images': images,
        'cover_url': cover,
    }
    await db.studios.insert_one(doc)
    doc.pop('_id', None)
    AnalyticsService.schedule(u['id'], "studio_listed", entity_type="studio", entity_id=sid)
    return doc

@api.get("/studios")
async def list_studios(city: Optional[str] = None, q: Optional[str] = None):
    return await _list_entity(db.studios, city, q)

@api.get("/studios/{sid}")
async def get_studio(sid: str):
    return await _get_entity_detail(db.studios, sid, owner_key='owner_id', cover_kind='studio')

@api.patch("/studios/{sid}")
async def patch_studio(sid: str, inp: StudioIn, u=Depends(get_user)):
    doc = await db.studios.find_one({'id': sid})
    if not doc: raise HTTPException(404, "Not found")
    if doc.get('owner_id') != u['id']: raise HTTPException(403, "Not yours to edit")
    images = list(inp.images or [])
    cover = _default_cover('studio', inp.cover_url or doc.get('cover_url'), images)
    if cover and cover not in images and not str(cover).startswith('https://images.unsplash.com'):
        images = [cover] + images
    if len(images) > STUDIO_MAX_IMAGES:
        raise HTTPException(400, f"Max {STUDIO_MAX_IMAGES} images allowed")
    data = {**inp.dict(), 'images': images, 'cover_url': cover, 'updated_at': now_iso()}
    await db.studios.update_one({'id': sid}, {'$set': data})
    return await db.studios.find_one({'id': sid}, {'_id': 0})

@api.post("/lessons")
async def create_lesson(inp: LessonIn, u=Depends(get_user)):
    lid = str(uuid.uuid4())
    data = inp.dict()
    data['cover_url'] = _default_cover('lesson', data.get('cover_url'))
    doc = {**data, 'id': lid, 'teacher_id': u['id'], 'created_at': now_iso()}
    await db.lessons.insert_one(doc)
    doc.pop('_id', None)
    AnalyticsService.schedule(u['id'], "lesson_created", entity_type="lesson", entity_id=lid)
    return doc

@api.get("/lessons")
async def list_lessons(city: Optional[str] = None, q: Optional[str] = None):
    return await _list_entity(db.lessons, city, q)

@api.get("/lessons/{lid}")
async def get_lesson(lid: str):
    return await _get_entity_detail(db.lessons, lid, owner_key='teacher_id', cover_kind='lesson')

@api.patch("/lessons/{lid}")
async def patch_lesson(lid: str, inp: LessonIn, u=Depends(get_user)):
    doc = await db.lessons.find_one({'id': lid})
    if not doc: raise HTTPException(404, "Not found")
    if doc.get('teacher_id') != u['id']: raise HTTPException(403, "Not yours to edit")
    data = inp.dict()
    data['cover_url'] = _default_cover('lesson', data.get('cover_url') or doc.get('cover_url'))
    data['updated_at'] = now_iso()
    await db.lessons.update_one({'id': lid}, {'$set': data})
    return await db.lessons.find_one({'id': lid}, {'_id': 0})

# ================== Community Feed / Posts ==================
@api.post("/posts")
async def create_post(inp: PostIn, u=Depends(get_user)):
    pid = str(uuid.uuid4())
    visibility = inp.visibility or 'public'
    doc = {'id': pid, 'author_id': u['id'], 'author_name': u['full_name'],
           'author_avatar': u.get('avatar_url'), 'text': inp.text,
           'media_url': inp.media_url, 'media_type': inp.media_type,
           'visibility': visibility,
           'like_count': 0, 'comment_count': 0, 'created_at': now_iso()}
    await db.posts.insert_one(doc)
    doc.pop('_id', None)
    deep = f"/user/{u['id']}/posts"
    preview = (inp.text or '').strip()
    preview = preview[:80] + ('…' if len(preview) > 80 else '') or 'Shared a new post'
    if visibility in ('public', 'followers'):
        follows = await db.follows.find(
            {'target_user_id': u['id']}, {'_id': 0, 'follower_id': 1}
        ).to_list(500)
        follower_ids = [f['follower_id'] for f in follows if f.get('follower_id')]
        if follower_ids:
            NotificationService.community_post(follower_ids, u, pid, preview)
    await _notify_mentions(inp.text or '', u, deep, skip_ids={u['id']})
    AnalyticsService.schedule(u['id'], "post_created", entity_type="post", entity_id=pid)
    AnalyticsService.schedule(u['id'], "first_post", entity_type="post", entity_id=pid, metadata={"funnel": True})
    return doc

@api.get("/posts/feed")
async def feed(limit: int = 50, u=Depends(get_user)):
    posts = await db.posts.find({}, {'_id': 0}).sort('created_at', -1).limit(limit).to_list(limit)
    liked_ids = set()
    if posts:
        pids = [p['id'] for p in posts]
        likes = await db.likes.find({'user_id': u['id'], 'post_id': {'$in': pids}}, {'_id': 0}).to_list(len(pids))
        liked_ids = {l['post_id'] for l in likes}
    for p in posts:
        p['liked'] = p['id'] in liked_ids
    return posts

@api.get("/posts/{pid}")
async def get_post(pid: str, u=Depends(get_user)):
    p = await db.posts.find_one({'id': pid}, {'_id': 0})
    if not p: raise HTTPException(404, "Not found")
    liked = await db.likes.find_one({'post_id': pid, 'user_id': u['id']}) is not None
    p['liked'] = liked
    comments = await db.comments.find({'post_id': pid}, {'_id': 0}).sort('created_at', 1).to_list(200)
    return {'post': p, 'comments': comments}

@api.post("/posts/{pid}/like")
async def toggle_like(pid: str, u=Depends(get_user)):
    p = await db.posts.find_one({'id': pid})
    if not p: raise HTTPException(404, "Not found")
    existing = await db.likes.find_one({'post_id': pid, 'user_id': u['id']})
    if existing:
        await db.likes.delete_one({'post_id': pid, 'user_id': u['id']})
        await db.posts.update_one({'id': pid}, {'$inc': {'like_count': -1}})
        return {'liked': False}
    await db.likes.insert_one({'post_id': pid, 'user_id': u['id'], 'created_at': now_iso()})
    await db.posts.update_one({'id': pid}, {'$inc': {'like_count': 1}})
    author = p.get('author_id')
    if author and author != u['id']:
        NotificationService.post_liked(author, u, pid)
    AnalyticsService.schedule(u['id'], "post_liked", entity_type="post", entity_id=pid)
    return {'liked': True}

@api.post("/posts/comment")
async def add_comment(inp: CommentIn, u=Depends(get_user)):
    if not inp.text.strip(): raise HTTPException(400, "Empty comment")
    post = await db.posts.find_one({'id': inp.post_id}, {'_id': 0})
    if not post: raise HTTPException(404, "Post not found")
    parent = None
    if inp.parent_id:
        parent = await db.comments.find_one({'id': inp.parent_id, 'post_id': inp.post_id}, {'_id': 0})
        if not parent:
            raise HTTPException(404, "Parent comment not found")
    doc = {
        'id': str(uuid.uuid4()), 'post_id': inp.post_id, 'author_id': u['id'],
        'author_name': u['full_name'], 'author_avatar': u.get('avatar_url'),
        'text': inp.text.strip(), 'parent_id': inp.parent_id,
        'created_at': now_iso(),
    }
    await db.comments.insert_one(doc)
    await db.posts.update_one({'id': inp.post_id}, {'$inc': {'comment_count': 1}})
    doc.pop('_id', None)
    preview = inp.text.strip()[:80] + ("…" if len(inp.text.strip()) > 80 else "")
    author = post.get('author_id')
    deep = f"/user/{author}/posts" if author else "/notifications"
    skip = {u['id']}
    if parent and parent.get('author_id') and parent['author_id'] != u['id']:
        NotificationService.comment_reply(parent['author_id'], u, inp.post_id, preview)
        skip.add(parent['author_id'])
    elif author and author != u['id']:
        NotificationService.post_commented(author, u, inp.post_id, preview)
        skip.add(author)
    await _notify_mentions(inp.text, u, deep, skip_ids=skip)
    AnalyticsService.schedule(u['id'], "comment_created", entity_type="post", entity_id=inp.post_id)
    return doc

@api.patch("/posts/{pid}")
async def edit_post(pid: str, inp: PostUpdate, u=Depends(get_user)):
    p = await db.posts.find_one({'id': pid})
    if not p: raise HTTPException(404, "Not found")
    if p['author_id'] != u['id']: raise HTTPException(403, "Not your post")
    patch = {k: v for k, v in inp.dict(exclude_unset=True).items() if v is not None}
    if not patch: raise HTTPException(400, "Nothing to update")
    patch['updated_at'] = now_iso()
    await db.posts.update_one({'id': pid}, {'$set': patch})
    updated = await db.posts.find_one({'id': pid}, {'_id': 0})
    return updated

@api.delete("/posts/{pid}")
async def delete_post(pid: str, u=Depends(get_user)):
    p = await db.posts.find_one({'id': pid})
    if not p: raise HTTPException(404, "Not found")
    if p['author_id'] != u['id']: raise HTTPException(403, "Not your post")
    await db.posts.delete_one({'id': pid})
    await db.comments.delete_many({'post_id': pid})
    await db.likes.delete_many({'post_id': pid})
    return {'deleted': True}

@api.delete("/comments/{cid}")
async def delete_comment(cid: str, u=Depends(get_user)):
    c = await db.comments.find_one({'id': cid})
    if not c: raise HTTPException(404, "Not found")
    if c['author_id'] != u['id']: raise HTTPException(403, "Not your comment")
    await db.comments.delete_one({'id': cid})
    await db.posts.update_one({'id': c['post_id']}, {'$inc': {'comment_count': -1}})
    return {'deleted': True}

async def _delete_owned(collection, owner_field: str, item_id: str, uid: str):
    doc = await collection.find_one({'id': item_id})
    if not doc: raise HTTPException(404, "Not found")
    if doc.get(owner_field) != uid: raise HTTPException(403, "Not yours to delete")
    await collection.delete_one({'id': item_id})
    return {'deleted': True}

@api.delete("/gigs/{gid}")
async def delete_gig(gid: str, u=Depends(get_user)):
    r = await _delete_owned(db.gigs, 'organizer_id', gid, u['id'])
    await db.applications.delete_many({'gig_id': gid})
    return r

@api.delete("/bands/{bid}")
async def delete_band(bid: str, u=Depends(get_user)):
    return await _delete_owned(db.bands, 'owner_id', bid, u['id'])

@api.delete("/equipment/{eid}")
async def delete_equipment(eid: str, u=Depends(get_user)):
    return await _delete_owned(db.equipment, 'owner_id', eid, u['id'])

@api.delete("/studios/{sid}")
async def delete_studio(sid: str, u=Depends(get_user)):
    return await _delete_owned(db.studios, 'owner_id', sid, u['id'])

@api.delete("/lessons/{lid}")
async def delete_lesson(lid: str, u=Depends(get_user)):
    return await _delete_owned(db.lessons, 'teacher_id', lid, u['id'])

@api.post("/follow/{target_id}")
async def toggle_follow(target_id: str, u=Depends(get_user)):
    if target_id == u['id']:
        raise HTTPException(400, "Cannot follow yourself")
    existing = await db.follows.find_one({'follower_id': u['id'], 'target_user_id': target_id})
    if existing:
        await db.follows.delete_one({'follower_id': u['id'], 'target_user_id': target_id})
        AnalyticsService.schedule(u['id'], "unfollow", entity_type="user", entity_id=target_id)
        return {'following': False}
    await db.follows.insert_one({'follower_id': u['id'], 'target_user_id': target_id,
                                 'created_at': now_iso()})
    NotificationService.new_follower(target_id, u)
    AnalyticsService.schedule(u['id'], "follow", entity_type="user", entity_id=target_id)
    return {'following': True}

async def _users_summary(user_ids: list[str]):
    if not user_ids: return []
    cursor = db.users.find({'id': {'$in': user_ids}}, {'_id': 0, 'password_hash': 0})
    users = await cursor.to_list(200)
    # Preserve original order
    by_id = {u['id']: u for u in users}
    out = []
    for uid in user_ids:
        u = by_id.get(uid)
        if not u: continue
        m = await db.musicians.find_one({'user_id': uid}, {'_id': 0, 'tagline': 1, 'city': 1, 'user_id': 1})
        out.append({
            'id': u['id'], 'full_name': u.get('full_name'),
            'avatar_url': u.get('avatar_url'), 'verified': u.get('verified', False),
            'tagline': (m or {}).get('tagline'), 'city': (m or {}).get('city'),
        })
    return out

@api.get("/users/{uid}/followers")
async def list_followers(uid: str):
    rows = await db.follows.find({'target_user_id': uid}, {'_id': 0}).sort('created_at', -1).to_list(200)
    return await _users_summary([r['follower_id'] for r in rows])

@api.get("/users/{uid}/following")
async def list_following(uid: str):
    rows = await db.follows.find({'follower_id': uid}, {'_id': 0}).sort('created_at', -1).to_list(200)
    return await _users_summary([r['target_user_id'] for r in rows])

@api.get("/users/{uid}/posts")
async def list_user_posts(uid: str, request: Request, skip: int = 0, limit: int = 20):
    """Paginated posts for a user profile. Visibility-aware for non-owners."""
    viewer = await _optional_user(request)
    is_self = bool(viewer and viewer['id'] == uid)
    limit = max(1, min(int(limit or 20), 50))
    skip = max(0, int(skip or 0))
    post_filter: dict = {'author_id': uid}
    if not is_self:
        post_filter = {'author_id': uid, '$or': [
            {'visibility': 'public'}, {'visibility': {'$exists': False}}
        ]}
    total = await db.posts.count_documents(post_filter)
    items = await db.posts.find(post_filter, {'_id': 0}).sort('created_at', -1).skip(skip).limit(limit).to_list(limit)
    return {
        'items': items,
        'total': total,
        'skip': skip,
        'limit': limit,
        'has_more': skip + len(items) < total,
    }

@api.get("/entities/mine")
async def my_entities(u=Depends(get_user)):
    return {
        'gigs': await db.gigs.find({'organizer_id': u['id']}, {'_id': 0}).to_list(50),
        'bands': await db.bands.find({'owner_id': u['id']}, {'_id': 0}).to_list(50),
        'equipment': await db.equipment.find({'owner_id': u['id']}, {'_id': 0}).to_list(50),
        'studios': await db.studios.find({'owner_id': u['id']}, {'_id': 0}).to_list(50),
        'lessons': await db.lessons.find({'teacher_id': u['id']}, {'_id': 0}).to_list(50),
        'posts': await db.posts.find({'author_id': u['id']}, {'_id': 0}).to_list(50),
    }

@api.get("/users/{uid}/entities")
async def user_entities(uid: str):
    """Public view of a user's entities. Same shape as /entities/mine but
    excludes posts with visibility != 'public'. Everything else is public
    marketplace data."""
    return {
        'gigs': await db.gigs.find({'organizer_id': uid}, {'_id': 0}).sort('created_at', -1).to_list(50),
        'bands': await db.bands.find({'owner_id': uid}, {'_id': 0}).sort('created_at', -1).to_list(50),
        'equipment': await db.equipment.find({'owner_id': uid}, {'_id': 0}).sort('created_at', -1).to_list(50),
        'studios': await db.studios.find({'owner_id': uid}, {'_id': 0}).sort('created_at', -1).to_list(50),
        'lessons': await db.lessons.find({'teacher_id': uid}, {'_id': 0}).sort('created_at', -1).to_list(50),
        'posts': await db.posts.find(
            {'author_id': uid, '$or': [{'visibility': 'public'}, {'visibility': {'$exists': False}}]},
            {'_id': 0}
        ).sort('created_at', -1).to_list(50),
    }

app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

@app.on_event("startup")
async def startup():
    try:
        await init_pool()
        # Migrate legacy single-role user docs if present
        legacy = await db.users.find_one({'role': {'$exists': True}}, {'_id': 0})
        if legacy:
            async for doc in db.users.find({'role': {'$exists': True}}):
                r = doc.get('role')
                update = {'$unset': {'role': ""}}
                if r and 'roles' not in doc:
                    update['$set'] = {'roles': [r], 'active_role': r}
                await db.users.update_one({'id': doc['id']}, update)
    except Exception as e:
        logging.exception("Startup error: %s", e)

@app.on_event("shutdown")
async def shutdown_db_client():
    await close_pool()
