from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os, logging, uuid, jwt, bcrypt
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
from datetime import datetime, timedelta, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ.get('JWT_SECRET', 'stagelink-dev-secret-change-me')
JWT_ALGO = 'HS256'
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="StageLink API")
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

# ================== Models ==================
Role = Literal['musician', 'organizer']

import re
def _validate_password(p: str) -> str:
    if not isinstance(p, str) or len(p) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not re.search(r'[A-Za-z]', p) or not re.search(r'\d', p):
        raise ValueError("Password must contain letters and numbers")
    return p

from pydantic import field_validator

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
    city: str
    state: Optional[str] = None
    country: Optional[str] = "India"
    genres: List[str] = []
    instruments: List[str] = []
    languages: List[str] = []
    professions: List[str] = []
    skills: List[str] = []
    experience_years: int = 0
    pricing_per_hour: int = 0
    willing_to_travel: bool = True
    travel_radius_km: Optional[int] = 50
    dob: Optional[str] = None
    gender: Optional[str] = None
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
    experience_years: Optional[int] = None
    pricing_per_hour: Optional[int] = None
    willing_to_travel: Optional[bool] = None
    travel_radius_km: Optional[int] = None
    dob: Optional[str] = None
    gender: Optional[str] = None
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

class PortfolioItemIn(BaseModel):
    title: str
    description: Optional[str] = ""
    category: Optional[str] = "Performance"
    media_url: str
    media_type: Literal['image', 'video', 'audio', 'link', 'pdf'] = 'image'
    thumbnail_url: Optional[str] = None
    tags: List[str] = []
    date: Optional[str] = None

class ServiceIn(BaseModel):
    title: str
    description: str
    price: int
    pricing_type: Literal['per_hour', 'per_event', 'per_song', 'starting_at'] = 'per_hour'
    duration: Optional[str] = None

class OrganizerProfileIn(BaseModel):
    org_name: str
    city: str
    bio: Optional[str] = ""
    avatar_url: Optional[str] = None

class GigCreate(BaseModel):
    title: str
    city: str
    date: str
    event_type: str
    genre: str
    instrument_needed: str
    budget: int
    description: str
    cover_url: Optional[str] = None

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

class AIBioIn(BaseModel):
    tone: str = "professional"

class AIPricingIn(BaseModel):
    city: str
    experience_years: int
    genres: List[str]
    instruments: List[str]

# ================== Entity Models ==================
class BandIn(BaseModel):
    name: str
    city: str
    genres: List[str] = []
    description: Optional[str] = ""
    cover_url: Optional[str] = None
    looking_for: List[str] = []

class EquipmentIn(BaseModel):
    title: str
    listing_type: Literal['rent', 'sale']
    category: str  # guitar, mic, monitor, etc.
    city: str
    price: int
    description: str
    cover_url: Optional[str] = None

class StudioIn(BaseModel):
    name: str
    city: str
    hourly_rate: int
    description: str
    cover_url: Optional[str] = None

class LessonIn(BaseModel):
    title: str
    subject: str  # instrument or theory area
    city: str
    price_per_hour: int
    format: Literal['online', 'in-person', 'both'] = 'both'
    description: str
    cover_url: Optional[str] = None

class PostIn(BaseModel):
    text: str
    media_url: Optional[str] = None
    media_type: Optional[Literal['image', 'video']] = None
    visibility: Optional[Literal['public', 'followers', 'private']] = 'public'

class CommentIn(BaseModel):
    post_id: str
    text: str

class PostUpdate(BaseModel):
    text: Optional[str] = None
    media_url: Optional[str] = None
    media_type: Optional[Literal['image', 'video']] = None
    visibility: Optional[Literal['public', 'followers', 'private']] = None

# ================== Helpers ==================
def now_iso():
    return datetime.now(timezone.utc).isoformat()

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
    return {'ok': True}

@api.get("/auth/me", response_model=UserOut)
async def me(u=Depends(get_user)):
    return user_public(u)

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
    return {'ok': True}

@api.patch("/profile/musician")
async def patch_musician(inp: ProfilePatchIn, u=Depends(get_user)):
    updates = {k: v for k, v in inp.dict(exclude_unset=True).items() if v is not None}
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
    item = inp.dict()
    item['id'] = str(uuid.uuid4())
    item['created_at'] = now_iso()
    await db.musicians.update_one(
        {'user_id': u['id']},
        {'$push': {'portfolio_items': item}, '$set': {'updated_at': now_iso()}},
        upsert=True,
    )
    return item

@api.delete("/profile/portfolio/{item_id}")
async def delete_portfolio_item(item_id: str, u=Depends(get_user)):
    before = await db.musicians.find_one({'user_id': u['id']}, {'portfolio_items': 1}) or {}
    r = await db.musicians.update_one(
        {'user_id': u['id']},
        {'$pull': {'portfolio_items': {'id': item_id}}, '$set': {'updated_at': now_iso()}},
    )
    after = await db.musicians.find_one({'user_id': u['id']}, {'portfolio_items': 1}) or {}
    deleted = len(before.get('portfolio_items') or []) - len(after.get('portfolio_items') or [])
    return {'deleted': max(deleted, 0)}

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
        ('pricing_per_hour', 'Set your hourly rate', 10),
        ('experience_years', 'Add years of experience', 5),
        ('portfolio_items', 'Upload portfolio items', 10),
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
async def get_musician(user_id: str):
    m = await db.musicians.find_one({'user_id': user_id}, {'_id': 0})
    if not m: raise HTTPException(404, "Not found")
    u = await db.users.find_one({'id': user_id}, {'_id': 0, 'password_hash': 0})
    reviews = await db.reviews.find({'target_user_id': user_id}, {'_id': 0}).to_list(50)
    rating = round(sum(r['rating'] for r in reviews) / len(reviews), 1) if reviews else 0
    reliability = min(100, 60 + len(reviews) * 4)
    followers = await db.follows.count_documents({'target_user_id': user_id})
    following = await db.follows.count_documents({'follower_id': user_id})
    return {'user': user_public(u) if u else None, 'profile': m, 'rating': rating,
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
    m = await db.musicians.find_one({'user_id': user_id}, {'_id': 0})
    if not m: raise HTTPException(404, "Profile not found")
    u = await db.users.find_one({'id': user_id}, {'_id': 0, 'password_hash': 0})
    if not u: raise HTTPException(404, "User not found")
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
    entities = {
        'posts': await db.posts.find(post_filter, {'_id': 0}).sort('created_at', -1).to_list(50),
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

    # Upcoming events: for organizers, future own gigs; for musicians, gigs where
    # they have an accepted application in the future.
    today = now_str[:10]
    org_upcoming = await db.gigs.find({
        'organizer_id': user_id, 'date': {'$gte': today}
    }, {'_id': 0}).sort('date', 1).limit(5).to_list(5)
    mus_apps = await db.applications.find({
        'musician_id': user_id, 'status': 'accepted'
    }, {'_id': 0}).to_list(50)
    mus_gig_ids = [a['gig_id'] for a in mus_apps]
    mus_upcoming = await db.gigs.find({
        'id': {'$in': mus_gig_ids}, 'date': {'$gte': today}
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

    # Community activity — lightweight counts for the section
    likes_given = await db.likes.count_documents({'user_id': user_id})
    comments_given = await db.comments.count_documents({'author_id': user_id})
    community_activity = {
        'posts_count': len(entities['posts']),
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
        'profile': m,
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
    query = {}
    if city and city != 'All': query['city'] = {'$regex': f'^{city}$', '$options': 'i'}
    if genre and genre != 'All': query['genres'] = {'$in': [genre]}
    if instrument and instrument != 'All': query['instruments'] = {'$in': [instrument]}
    docs = await db.musicians.find(query, {'_id': 0}).limit(limit).to_list(limit)
    out = []
    for m in docs:
        u = await db.users.find_one({'id': m['user_id']}, {'_id': 0, 'password_hash': 0})
        if not u: continue
        if q and q.lower() not in (u['full_name'] + ' ' + ' '.join(m.get('genres', []))).lower():
            continue
        out.append({'user': user_public(u), 'profile': m})
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
    query = {}
    if city and city != 'All': query['city'] = {'$regex': city, '$options': 'i'}
    if q: query['name'] = {'$regex': q, '$options': 'i'}
    return await db.venues.find(query, {'_id': 0}).limit(limit).to_list(limit)

# ================== Gigs ==================
@api.post("/gigs")
async def create_gig(inp: GigCreate, u=Depends(get_user)):
    # Action-based: any user can post a hiring gig
    gid = str(uuid.uuid4())
    doc = inp.dict()
    doc.update({'id': gid, 'organizer_id': u['id'], 'status': 'open',
                'created_at': now_iso(), 'featured': False})
    await db.gigs.insert_one(doc)
    doc.pop('_id', None)
    return doc

@api.get("/gigs")
async def list_gigs(city: Optional[str] = None, genre: Optional[str] = None,
                    instrument: Optional[str] = None, event_type: Optional[str] = None,
                    min_budget: Optional[int] = None, max_budget: Optional[int] = None,
                    q: Optional[str] = None, limit: int = 100):
    query = {'status': 'open'}
    if city and city != 'All': query['city'] = {'$regex': city, '$options': 'i'}
    if genre and genre != 'All': query['genre'] = genre
    if instrument and instrument != 'All': query['instrument_needed'] = instrument
    if event_type and event_type != 'All': query['event_type'] = event_type
    if min_budget is not None: query['budget'] = {'$gte': min_budget}
    if max_budget is not None: query.setdefault('budget', {})['$lte'] = max_budget
    if q:
        query['$or'] = [{'title': {'$regex': q, '$options': 'i'}},
                        {'description': {'$regex': q, '$options': 'i'}}]
    return await db.gigs.find(query, {'_id': 0}).sort('featured', -1).limit(limit).to_list(limit)

@api.get("/gigs/{gid}")
async def get_gig(gid: str):
    g = await db.gigs.find_one({'id': gid}, {'_id': 0})
    if not g: raise HTTPException(404, "Not found")
    org_user = await db.users.find_one({'id': g['organizer_id']}, {'_id': 0, 'password_hash': 0})
    org_profile = await db.organizers.find_one({'user_id': g['organizer_id']}, {'_id': 0})
    apps_count = await db.applications.count_documents({'gig_id': gid})
    return {'gig': g, 'organizer_user': user_public(org_user) if org_user else None,
            'organizer_profile': org_profile, 'applications_count': apps_count}

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
    if await db.applications.find_one({'gig_id': inp.gig_id, 'musician_id': u['id']}):
        raise HTTPException(400, "Already applied")
    aid = str(uuid.uuid4())
    doc = {'id': aid, 'gig_id': inp.gig_id, 'musician_id': u['id'],
           'message': inp.message, 'status': 'pending', 'created_at': now_iso()}
    await db.applications.insert_one(doc)
    doc.pop('_id', None)
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
    apps = await db.applications.find({'gig_id': gid}, {'_id': 0}).to_list(200)
    out = []
    for a in apps:
        mu = await db.users.find_one({'id': a['musician_id']}, {'_id': 0, 'password_hash': 0})
        mp = await db.musicians.find_one({'user_id': a['musician_id']}, {'_id': 0})
        out.append({'application': a, 'musician_user': user_public(mu) if mu else None, 'musician_profile': mp})
    return out

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
    return [g for _, g in scored[:5]]

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
            if ux: featured_musicians.append({'user': user_public(ux), 'profile': m})
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

# ================== Seed ==================
@api.post("/seed")
async def seed():
    if await db.users.count_documents({}) > 3:
        # ensure venues exist
        if await db.venues.count_documents({}) == 0:
            await seed_venues()
        return {'seeded': False, 'reason': 'Already seeded'}
    await do_seed()
    return {'seeded': True}

async def seed_venues():
    venues = [
        {'id': str(uuid.uuid4()), 'name': 'The Blue Frog', 'city': 'Mumbai', 'type': 'Club',
         'cover_url': 'https://images.unsplash.com/photo-1493225255756-d9584f8606e9?w=800',
         'capacity': 300, 'rating': 4.7},
        {'id': str(uuid.uuid4()), 'name': 'Fandom @ Gilly\'s', 'city': 'Bengaluru', 'type': 'Club',
         'cover_url': 'https://images.unsplash.com/photo-1571266028243-e4bb35f01e9d?w=800',
         'capacity': 500, 'rating': 4.6},
        {'id': str(uuid.uuid4()), 'name': 'Hard Rock Cafe', 'city': 'Delhi', 'type': 'Lounge',
         'cover_url': 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800',
         'capacity': 250, 'rating': 4.5},
        {'id': str(uuid.uuid4()), 'name': 'antiSocial', 'city': 'Mumbai', 'type': 'Underground',
         'cover_url': 'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=800',
         'capacity': 200, 'rating': 4.8},
    ]
    await db.venues.insert_many(venues)

async def do_seed():
    orgs = [
        {'email': 'sunset@stagelink.dev', 'full_name': 'Sunset Sound Co', 'org': 'Sunset Sound Co', 'city': 'Mumbai'},
        {'email': 'nova@stagelink.dev', 'full_name': 'Nova Events', 'org': 'Nova Events', 'city': 'Bengaluru'},
        {'email': 'ember@stagelink.dev', 'full_name': 'Ember Weddings', 'org': 'Ember Weddings', 'city': 'Delhi'},
    ]
    org_ids = []
    for o in orgs:
        uid = str(uuid.uuid4())
        await db.users.insert_one({'id': uid, 'email': o['email'], 'full_name': o['full_name'],
                                   'password_hash': hash_pw('demo1234'), 'roles': ['organizer', 'musician'],
                                   'active_role': 'organizer', 'onboarded': True,
                                   'verified': True, 'premium': False,
                                   'avatar_url': None, 'created_at': now_iso()})
        await db.organizers.insert_one({'user_id': uid, 'org_name': o['org'], 'city': o['city'],
                                        'bio': f"Premium event partners in {o['city']}.", 'updated_at': now_iso()})
        org_ids.append(uid)

    musicians = [
        {'name': 'Ariya Kapoor', 'city': 'Mumbai', 'genres': ['Jazz', 'Soul'], 'instruments': ['Vocals'], 'exp': 8, 'price': 6000,
         'avatar': 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=400',
         'cover': 'https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=1200'},
        {'name': 'Kabir Rao', 'city': 'Bengaluru', 'genres': ['Indie', 'Rock'], 'instruments': ['Guitar'], 'exp': 5, 'price': 4500,
         'avatar': 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400',
         'cover': 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=1200'},
        {'name': 'Naina Iyer', 'city': 'Delhi', 'genres': ['Classical', 'Fusion'], 'instruments': ['Violin'], 'exp': 12, 'price': 8500,
         'avatar': 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=400',
         'cover': 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=1200'},
        {'name': 'Rohan Menon', 'city': 'Mumbai', 'genres': ['EDM', 'House'], 'instruments': ['DJ Deck'], 'exp': 6, 'price': 12000,
         'avatar': 'https://images.unsplash.com/photo-1493225255756-d9584f8606e9?w=400',
         'cover': 'https://images.unsplash.com/photo-1571266028243-e4bb35f01e9d?w=1200'},
        {'name': 'Priya Verma', 'city': 'Bengaluru', 'genres': ['Pop', 'R&B'], 'instruments': ['Vocals', 'Keyboard'], 'exp': 4, 'price': 5500,
         'avatar': 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
         'cover': 'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=1200'},
        {'name': 'Dev Sharma', 'city': 'Delhi', 'genres': ['Rock', 'Metal'], 'instruments': ['Drums'], 'exp': 9, 'price': 7000,
         'avatar': 'https://images.unsplash.com/photo-1520785643438-5bf77931f493?w=400',
         'cover': 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1200'},
    ]
    musician_ids = []
    for i, m in enumerate(musicians):
        uid = str(uuid.uuid4())
        musician_ids.append(uid)
        await db.users.insert_one({'id': uid, 'email': m['name'].lower().replace(' ', '.') + '@stagelink.dev',
                                   'full_name': m['name'], 'password_hash': hash_pw('demo1234'),
                                   'roles': ['musician', 'organizer'],
                                   'active_role': 'musician', 'onboarded': True,
                                   'verified': i < 3, 'premium': i < 2,
                                   'avatar_url': m['avatar'], 'created_at': now_iso()})
        await db.musicians.insert_one({'user_id': uid,
                                       'bio': f"{m['name']} — {'/'.join(m['genres'])} artist based in {m['city']}. "
                                              f"Bringing high-energy live sets crafted for unforgettable nights.",
                                       'city': m['city'], 'genres': m['genres'], 'instruments': m['instruments'],
                                       'languages': ['English', 'Hindi'], 'experience_years': m['exp'],
                                       'pricing_per_hour': m['price'], 'demo_video_url': None,
                                       'youtube_url': f"https://youtube.com/@{m['name'].lower().replace(' ','')}",
                                       'instagram_url': f"https://instagram.com/{m['name'].lower().replace(' ','')}",
                                       'avatar_url': m['avatar'], 'cover_url': m['cover'],
                                       'updated_at': now_iso()})
        await db.reviews.insert_one({'id': str(uuid.uuid4()), 'author_id': org_ids[i % 3],
                                     'target_user_id': uid, 'rating': 5,
                                     'author_name': 'Sunset Sound Co',
                                     'comment': 'Absolute pro. On-time, prepared, and phenomenal on stage.',
                                     'created_at': now_iso()})

    gigs = [
        {'title': 'Rooftop Jazz Night', 'city': 'Mumbai', 'event_type': 'club', 'genre': 'Jazz',
         'instrument_needed': 'Vocals', 'budget': 15000,
         'description': 'Sophisticated 3-hour rooftop set for our monthly jazz series.',
         'cover_url': 'https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=800'},
        {'title': 'Beachside Wedding Reception', 'city': 'Mumbai', 'event_type': 'wedding', 'genre': 'Pop',
         'instrument_needed': 'Vocals', 'budget': 45000,
         'description': 'Live acoustic set during cocktail hour + reception.',
         'cover_url': 'https://images.unsplash.com/photo-1519741497674-611481863552?w=800'},
        {'title': 'Corporate Off-site — Indie Set', 'city': 'Bengaluru', 'event_type': 'corporate', 'genre': 'Indie',
         'instrument_needed': 'Guitar', 'budget': 22000,
         'description': 'Chill 90-minute indie set for a tech company off-site.',
         'cover_url': 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800'},
        {'title': 'Diwali Fusion Concert', 'city': 'Delhi', 'event_type': 'festival', 'genre': 'Fusion',
         'instrument_needed': 'Violin', 'budget': 38000,
         'description': 'Headline slot at our annual Diwali arts festival.',
         'cover_url': 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800'},
        {'title': 'Warehouse EDM Night', 'city': 'Mumbai', 'event_type': 'club', 'genre': 'EDM',
         'instrument_needed': 'DJ Deck', 'budget': 30000,
         'description': 'Underground 2-hour set at a converted warehouse space.',
         'cover_url': 'https://images.unsplash.com/photo-1571266028243-e4bb35f01e9d?w=800'},
        {'title': 'Cafe Sundowner Series', 'city': 'Bengaluru', 'event_type': 'private', 'genre': 'Soul',
         'instrument_needed': 'Vocals', 'budget': 8000,
         'description': 'Weekly Sunday 2-hour acoustic set.',
         'cover_url': 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800'},
        {'title': 'Sangeet Night', 'city': 'Delhi', 'event_type': 'wedding', 'genre': 'Pop',
         'instrument_needed': 'Keyboard', 'budget': 28000,
         'description': 'Live band for pre-wedding sangeet.',
         'cover_url': 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800'},
        {'title': 'Startup Launch Party', 'city': 'Bengaluru', 'event_type': 'corporate', 'genre': 'R&B',
         'instrument_needed': 'Vocals', 'budget': 18000,
         'description': 'Live vocals + DJ hybrid for 200-guest launch event.',
         'cover_url': 'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=800'},
        {'title': 'Metal Fest — Stage 2', 'city': 'Delhi', 'event_type': 'festival', 'genre': 'Rock',
         'instrument_needed': 'Drums', 'budget': 55000,
         'description': 'Support slot at Delhi\'s biggest indie metal fest.',
         'cover_url': 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800'},
    ]
    gig_ids = []
    for i, g in enumerate(gigs):
        gid = str(uuid.uuid4())
        gig_ids.append(gid)
        future = (datetime.now(timezone.utc) + timedelta(days=7 + i * 4)).date().isoformat()
        await db.gigs.insert_one({**g, 'id': gid, 'organizer_id': org_ids[i % len(org_ids)],
                                  'date': future, 'status': 'open', 'created_at': now_iso(),
                                  'featured': i < 2})

    # Seed applications + messages
    if musician_ids:
        await db.applications.insert_one({'id': str(uuid.uuid4()), 'gig_id': gig_ids[0],
                                          'musician_id': musician_ids[0], 'message': 'Would love to play this set!',
                                          'status': 'accepted', 'created_at': now_iso()})
        await db.messages.insert_one({'id': str(uuid.uuid4()), 'from_id': org_ids[0], 'to_id': musician_ids[0],
                                      'text': "Hey Ariya, loved your last set. You free next Friday?",
                                      'read': False, 'created_at': now_iso()})
        await db.messages.insert_one({'id': str(uuid.uuid4()), 'from_id': musician_ids[0], 'to_id': org_ids[0],
                                      'text': "Absolutely — send me the venue details please.",
                                      'read': True, 'created_at': now_iso()})

        # Community posts
        posts_seed = [
            {'author_idx': 0, 'text': "Rooftop rehearsal at sunset. New setlist coming together beautifully.",
             'media_url': "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800", 'media_type': 'image'},
            {'author_idx': 1, 'text': "Finally got the pedalboard dialed in — try this signal chain if you want warmth without mud.",
             'media_url': "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800", 'media_type': 'image'},
            {'author_idx': 2, 'text': "Backstage before the Diwali fusion set. What a night ahead.",
             'media_url': "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800", 'media_type': 'image'},
            {'author_idx': 3, 'text': "Dropped a new house edit on my page. Feedback welcome — this one's for the warehouse crowd.",
             'media_url': None, 'media_type': None},
        ]
        for p in posts_seed:
            aid = musician_ids[p['author_idx']]
            ax_user = await db.users.find_one({'id': aid})
            await db.posts.insert_one({'id': str(uuid.uuid4()), 'author_id': aid,
                                       'author_name': ax_user['full_name'],
                                       'author_avatar': ax_user.get('avatar_url'),
                                       'text': p['text'], 'media_url': p['media_url'],
                                       'media_type': p['media_type'],
                                       'like_count': 12 + (p['author_idx'] * 5),
                                       'comment_count': 2 + p['author_idx'],
                                       'created_at': now_iso()})

        # Bands
        await db.bands.insert_one({'id': str(uuid.uuid4()), 'name': 'Midnight Kolaba',
                                   'owner_id': musician_ids[0], 'city': 'Mumbai',
                                   'genres': ['Jazz', 'Soul'],
                                   'description': '4-piece live band for luxury weddings and rooftop events.',
                                   'cover_url': 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800',
                                   'looking_for': ['Bassist'], 'members': [musician_ids[0]],
                                   'created_at': now_iso()})
        await db.bands.insert_one({'id': str(uuid.uuid4()), 'name': 'Static Signal',
                                   'owner_id': musician_ids[1], 'city': 'Bengaluru',
                                   'genres': ['Indie', 'Rock'],
                                   'description': 'Indie rock outfit playing tech offsites and pubs.',
                                   'cover_url': 'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=800',
                                   'looking_for': ['Drummer', 'Keys'], 'members': [musician_ids[1]],
                                   'created_at': now_iso()})

        # Equipment
        eqs = [
            {'title': 'Fender Stratocaster (2019) — Mint', 'listing_type': 'sale', 'category': 'Guitar',
             'city': 'Mumbai', 'price': 68000, 'owner_id': musician_ids[1],
             'description': 'American Standard, includes hard case. Barely gigged.',
             'cover_url': 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=800'},
            {'title': 'Shure SM58 x 4 — Rent', 'listing_type': 'rent', 'category': 'Mic',
             'city': 'Bengaluru', 'price': 500, 'owner_id': musician_ids[4],
             'description': '4 SM58s + XLR cables. Per day rate.',
             'cover_url': 'https://images.unsplash.com/photo-1590602846989-a3ff5a1f45f2?w=800'},
            {'title': 'Pioneer CDJ-3000 pair — Rent', 'listing_type': 'rent', 'category': 'DJ',
             'city': 'Mumbai', 'price': 6000, 'owner_id': musician_ids[3],
             'description': 'Latest CDJs + DJM-900 mixer. Per event rental.',
             'cover_url': 'https://images.unsplash.com/photo-1571266028243-e4bb35f01e9d?w=800'},
        ]
        for e in eqs:
            await db.equipment.insert_one({**e, 'id': str(uuid.uuid4()), 'created_at': now_iso()})

        # Studios
        await db.studios.insert_one({'id': str(uuid.uuid4()), 'name': 'Loft Studios',
                                     'owner_id': org_ids[0], 'city': 'Mumbai',
                                     'hourly_rate': 1500,
                                     'description': 'Vintage-tuned live room + control room. Great for indie sessions.',
                                     'cover_url': 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800',
                                     'created_at': now_iso()})

        # Lessons
        await db.lessons.insert_one({'id': str(uuid.uuid4()), 'title': 'Modern Vocal Coaching',
                                     'teacher_id': musician_ids[0], 'subject': 'Vocals',
                                     'city': 'Mumbai', 'price_per_hour': 1200, 'format': 'both',
                                     'description': 'Contemporary vocal technique — jazz, pop, soul. All levels.',
                                     'cover_url': 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=800',
                                     'created_at': now_iso()})
        await db.lessons.insert_one({'id': str(uuid.uuid4()), 'title': 'Fingerstyle Guitar Intensive',
                                     'teacher_id': musician_ids[1], 'subject': 'Guitar',
                                     'city': 'Bengaluru', 'price_per_hour': 900, 'format': 'online',
                                     'description': 'Fingerstyle fundamentals, arrangement, tone. 8-week course.',
                                     'cover_url': 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800',
                                     'created_at': now_iso()})

    await seed_venues()

# ================== Root ==================
@api.get("/")
async def root():
    return {'app': 'StageLink API', 'version': '2.0'}

# ================== Entities: Bands / Equipment / Studios / Lessons ==================
async def _list_entity(coll, city, q, category=None, listing_type=None, limit=100):
    query = {}
    if city and city != 'All': query['city'] = {'$regex': city, '$options': 'i'}
    if category: query['category'] = category
    if listing_type: query['listing_type'] = listing_type
    if q:
        query['$or'] = [{'title': {'$regex': q, '$options': 'i'}},
                        {'name': {'$regex': q, '$options': 'i'}},
                        {'description': {'$regex': q, '$options': 'i'}}]
    return await coll.find(query, {'_id': 0}).sort('created_at', -1).limit(limit).to_list(limit)

@api.post("/bands")
async def create_band(inp: BandIn, u=Depends(get_user)):
    bid = str(uuid.uuid4())
    doc = {**inp.dict(), 'id': bid, 'owner_id': u['id'], 'created_at': now_iso(),
           'members': [u['id']]}
    await db.bands.insert_one(doc)
    doc.pop('_id', None)
    return doc

@api.get("/bands")
async def list_bands(city: Optional[str] = None, q: Optional[str] = None):
    return await _list_entity(db.bands, city, q)

@api.get("/bands/{bid}")
async def get_band(bid: str):
    d = await db.bands.find_one({'id': bid}, {'_id': 0})
    if not d: raise HTTPException(404, "Not found")
    return d

@api.post("/equipment")
async def create_equipment(inp: EquipmentIn, u=Depends(get_user)):
    eid = str(uuid.uuid4())
    doc = {**inp.dict(), 'id': eid, 'owner_id': u['id'], 'created_at': now_iso()}
    await db.equipment.insert_one(doc)
    doc.pop('_id', None)
    return doc

@api.get("/equipment")
async def list_equipment(city: Optional[str] = None, q: Optional[str] = None,
                          category: Optional[str] = None,
                          listing_type: Optional[str] = None):
    return await _list_entity(db.equipment, city, q, category=category, listing_type=listing_type)

@api.get("/equipment/{eid}")
async def get_equipment(eid: str):
    d = await db.equipment.find_one({'id': eid}, {'_id': 0})
    if not d: raise HTTPException(404, "Not found")
    return d

@api.post("/studios")
async def create_studio(inp: StudioIn, u=Depends(get_user)):
    sid = str(uuid.uuid4())
    doc = {**inp.dict(), 'id': sid, 'owner_id': u['id'], 'created_at': now_iso()}
    await db.studios.insert_one(doc)
    doc.pop('_id', None)
    return doc

@api.get("/studios")
async def list_studios(city: Optional[str] = None, q: Optional[str] = None):
    return await _list_entity(db.studios, city, q)

@api.post("/lessons")
async def create_lesson(inp: LessonIn, u=Depends(get_user)):
    lid = str(uuid.uuid4())
    doc = {**inp.dict(), 'id': lid, 'teacher_id': u['id'], 'created_at': now_iso()}
    await db.lessons.insert_one(doc)
    doc.pop('_id', None)
    return doc

@api.get("/lessons")
async def list_lessons(city: Optional[str] = None, q: Optional[str] = None):
    return await _list_entity(db.lessons, city, q)

# ================== Community Feed / Posts ==================
@api.post("/posts")
async def create_post(inp: PostIn, u=Depends(get_user)):
    pid = str(uuid.uuid4())
    doc = {'id': pid, 'author_id': u['id'], 'author_name': u['full_name'],
           'author_avatar': u.get('avatar_url'), 'text': inp.text,
           'media_url': inp.media_url, 'media_type': inp.media_type,
           'visibility': inp.visibility or 'public',
           'like_count': 0, 'comment_count': 0, 'created_at': now_iso()}
    await db.posts.insert_one(doc)
    doc.pop('_id', None)
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
    return {'liked': True}

@api.post("/posts/comment")
async def add_comment(inp: CommentIn, u=Depends(get_user)):
    if not inp.text.strip(): raise HTTPException(400, "Empty comment")
    doc = {'id': str(uuid.uuid4()), 'post_id': inp.post_id, 'author_id': u['id'],
           'author_name': u['full_name'], 'author_avatar': u.get('avatar_url'),
           'text': inp.text.strip(), 'created_at': now_iso()}
    await db.comments.insert_one(doc)
    await db.posts.update_one({'id': inp.post_id}, {'$inc': {'comment_count': 1}})
    doc.pop('_id', None)
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
        return {'following': False}
    await db.follows.insert_one({'follower_id': u['id'], 'target_user_id': target_id,
                                 'created_at': now_iso()})
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
        # Wipe old single-role user data if legacy fields exist (migration)
        legacy = await db.users.find_one({'role': {'$exists': True}}, {'_id': 0})
        if legacy:
            # migrate: convert role -> roles/active_role
            async for doc in db.users.find({'role': {'$exists': True}}):
                r = doc.get('role')
                update = {'$unset': {'role': ""}}
                if r and 'roles' not in doc:
                    update['$set'] = {'roles': [r], 'active_role': r}
                await db.users.update_one({'_id': doc['_id']}, update)
        if await db.users.count_documents({}) == 0:
            await do_seed()
        elif await db.venues.count_documents({}) == 0:
            await seed_venues()
    except Exception as e:
        logging.exception("Startup error: %s", e)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
