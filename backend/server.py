from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os, logging, uuid, jwt, bcrypt, asyncio
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

# ----------------- Models -----------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    full_name: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    role: Optional[Literal['musician', 'organizer']] = None
    onboarded: bool = False
    avatar_url: Optional[str] = None

class TokenOut(BaseModel):
    access_token: str
    user: UserOut

class RoleIn(BaseModel):
    role: Literal['musician', 'organizer']

class MusicianProfileIn(BaseModel):
    bio: Optional[str] = ""
    city: str
    genres: List[str] = []
    instruments: List[str] = []
    languages: List[str] = []
    experience_years: int = 0
    pricing_per_hour: int = 0
    demo_video_url: Optional[str] = None
    youtube_url: Optional[str] = None
    instagram_url: Optional[str] = None
    avatar_url: Optional[str] = None

class OrganizerProfileIn(BaseModel):
    org_name: str
    city: str
    bio: Optional[str] = ""
    avatar_url: Optional[str] = None

class GigCreate(BaseModel):
    title: str
    city: str
    date: str  # ISO
    event_type: str  # wedding/corporate/club/festival/private
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

class AIBioIn(BaseModel):
    tone: str = "professional"

class AIPricingIn(BaseModel):
    city: str
    experience_years: int
    genres: List[str]
    instruments: List[str]

class AIRecoIn(BaseModel):
    limit: int = 5

# ------------- Helpers -------------
def now_iso():
    return datetime.now(timezone.utc).isoformat()

def hash_pw(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()

def verify_pw(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False

def make_token(uid: str) -> str:
    payload = {'sub': uid, 'exp': datetime.now(timezone.utc) + timedelta(days=30)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

async def get_user(cred: HTTPAuthorizationCredentials = Depends(security)):
    if not cred:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        payload = jwt.decode(cred.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
        uid = payload['sub']
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    u = await db.users.find_one({'id': uid}, {'_id': 0, 'password_hash': 0})
    if not u:
        raise HTTPException(status_code=401, detail="User not found")
    return u

def user_public(u: dict) -> dict:
    return {
        'id': u['id'], 'email': u['email'], 'full_name': u['full_name'],
        'role': u.get('role'), 'onboarded': u.get('onboarded', False),
        'avatar_url': u.get('avatar_url'),
    }

# ------------- Auth -------------
@api.post("/auth/register", response_model=TokenOut)
async def register(inp: RegisterIn):
    if await db.users.find_one({'email': inp.email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    uid = str(uuid.uuid4())
    doc = {
        'id': uid, 'email': inp.email, 'full_name': inp.full_name,
        'password_hash': hash_pw(inp.password), 'role': None,
        'onboarded': False, 'created_at': now_iso(), 'avatar_url': None,
    }
    await db.users.insert_one(doc)
    return {'access_token': make_token(uid), 'user': user_public(doc)}

@api.post("/auth/login", response_model=TokenOut)
async def login(inp: LoginIn):
    u = await db.users.find_one({'email': inp.email})
    if not u or not verify_pw(inp.password, u['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {'access_token': make_token(u['id']), 'user': user_public(u)}

@api.get("/auth/me", response_model=UserOut)
async def me(u=Depends(get_user)):
    return user_public(u)

@api.post("/auth/role", response_model=UserOut)
async def set_role(inp: RoleIn, u=Depends(get_user)):
    await db.users.update_one({'id': u['id']}, {'$set': {'role': inp.role}})
    u['role'] = inp.role
    return user_public(u)

# ------------- Profiles -------------
@api.post("/profile/musician")
async def upsert_musician(inp: MusicianProfileIn, u=Depends(get_user)):
    doc = inp.dict()
    doc['user_id'] = u['id']
    doc['updated_at'] = now_iso()
    await db.musicians.update_one({'user_id': u['id']}, {'$set': doc}, upsert=True)
    updates = {'onboarded': True}
    if inp.avatar_url:
        updates['avatar_url'] = inp.avatar_url
    await db.users.update_one({'id': u['id']}, {'$set': updates})
    return {'ok': True}

@api.post("/profile/organizer")
async def upsert_organizer(inp: OrganizerProfileIn, u=Depends(get_user)):
    doc = inp.dict()
    doc['user_id'] = u['id']
    doc['updated_at'] = now_iso()
    await db.organizers.update_one({'user_id': u['id']}, {'$set': doc}, upsert=True)
    updates = {'onboarded': True}
    if inp.avatar_url:
        updates['avatar_url'] = inp.avatar_url
    await db.users.update_one({'id': u['id']}, {'$set': updates})
    return {'ok': True}

@api.get("/profile/musician/{user_id}")
async def get_musician(user_id: str):
    m = await db.musicians.find_one({'user_id': user_id}, {'_id': 0})
    if not m:
        raise HTTPException(status_code=404, detail="Not found")
    u = await db.users.find_one({'id': user_id}, {'_id': 0, 'password_hash': 0})
    # aggregate reviews
    reviews = await db.reviews.find({'target_user_id': user_id}, {'_id': 0}).to_list(50)
    rating = round(sum(r['rating'] for r in reviews) / len(reviews), 1) if reviews else 0
    reliability = min(100, 60 + len(reviews) * 4)
    return {'user': user_public(u) if u else None, 'profile': m, 'rating': rating,
            'review_count': len(reviews), 'reliability': reliability, 'reviews': reviews[:10]}

@api.get("/profile/organizer/{user_id}")
async def get_organizer(user_id: str):
    o = await db.organizers.find_one({'user_id': user_id}, {'_id': 0})
    if not o:
        raise HTTPException(status_code=404, detail="Not found")
    u = await db.users.find_one({'id': user_id}, {'_id': 0, 'password_hash': 0})
    return {'user': user_public(u) if u else None, 'profile': o}

# ------------- Musicians directory -------------
@api.get("/musicians")
async def list_musicians(city: Optional[str] = None, genre: Optional[str] = None,
                         instrument: Optional[str] = None, limit: int = 50):
    q = {}
    if city: q['city'] = {'$regex': f'^{city}$', '$options': 'i'}
    if genre: q['genres'] = {'$in': [genre]}
    if instrument: q['instruments'] = {'$in': [instrument]}
    docs = await db.musicians.find(q, {'_id': 0}).limit(limit).to_list(limit)
    out = []
    for m in docs:
        u = await db.users.find_one({'id': m['user_id']}, {'_id': 0, 'password_hash': 0})
        if not u: continue
        out.append({'user': user_public(u), 'profile': m})
    return out

# ------------- Gigs -------------
@api.post("/gigs")
async def create_gig(inp: GigCreate, u=Depends(get_user)):
    if u.get('role') != 'organizer':
        raise HTTPException(status_code=403, detail="Only organizers can create gigs")
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
    if city: query['city'] = {'$regex': city, '$options': 'i'}
    if genre: query['genre'] = genre
    if instrument: query['instrument_needed'] = instrument
    if event_type: query['event_type'] = event_type
    if min_budget is not None: query['budget'] = {'$gte': min_budget}
    if max_budget is not None:
        query.setdefault('budget', {})['$lte'] = max_budget
    if q:
        query['$or'] = [{'title': {'$regex': q, '$options': 'i'}},
                        {'description': {'$regex': q, '$options': 'i'}}]
    docs = await db.gigs.find(query, {'_id': 0}).sort('featured', -1).limit(limit).to_list(limit)
    return docs

@api.get("/gigs/{gid}")
async def get_gig(gid: str):
    g = await db.gigs.find_one({'id': gid}, {'_id': 0})
    if not g:
        raise HTTPException(status_code=404, detail="Not found")
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

# ------------- Applications -------------
@api.post("/applications")
async def apply(inp: ApplicationIn, u=Depends(get_user)):
    if u.get('role') != 'musician':
        raise HTTPException(status_code=403, detail="Only musicians can apply")
    g = await db.gigs.find_one({'id': inp.gig_id})
    if not g:
        raise HTTPException(status_code=404, detail="Gig not found")
    exists = await db.applications.find_one({'gig_id': inp.gig_id, 'musician_id': u['id']})
    if exists:
        raise HTTPException(status_code=400, detail="Already applied")
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
async def gig_applications(gid: str, u=Depends(get_user)):
    g = await db.gigs.find_one({'id': gid})
    if not g or g['organizer_id'] != u['id']:
        raise HTTPException(status_code=403, detail="Not allowed")
    apps = await db.applications.find({'gig_id': gid}, {'_id': 0}).to_list(200)
    out = []
    for a in apps:
        mu = await db.users.find_one({'id': a['musician_id']}, {'_id': 0, 'password_hash': 0})
        mp = await db.musicians.find_one({'user_id': a['musician_id']}, {'_id': 0})
        out.append({'application': a, 'musician_user': user_public(mu) if mu else None,
                    'musician_profile': mp})
    return out

# ------------- Reviews -------------
@api.post("/reviews")
async def create_review(inp: ReviewIn, u=Depends(get_user)):
    doc = {'id': str(uuid.uuid4()), 'author_id': u['id'], 'target_user_id': inp.target_user_id,
           'rating': inp.rating, 'comment': inp.comment, 'author_name': u['full_name'],
           'created_at': now_iso()}
    await db.reviews.insert_one(doc)
    doc.pop('_id', None)
    return doc

# ------------- AI -------------
async def call_llm(system: str, prompt: str) -> str:
    if not EMERGENT_LLM_KEY:
        return "AI unavailable. Please add EMERGENT_LLM_KEY to backend .env."
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
    text = await call_llm("You are a music industry copywriter crafting concise, elegant artist bios.", prompt)
    return {'bio': text}

@api.post("/ai/pricing")
async def ai_pricing(inp: AIPricingIn, u=Depends(get_user)):
    prompt = (f"Suggest an hourly pricing range in INR for a live musician in {inp.city} "
              f"with {inp.experience_years} years experience, genres {inp.genres}, instruments {inp.instruments}. "
              "Respond strictly as JSON with keys min, max, recommended, reasoning (1 short sentence). "
              "Values are integers in INR per hour.")
    text = await call_llm("You are a live music market analyst for India. Reply ONLY valid minified JSON.", prompt)
    import json as _json, re
    try:
        # strip markdown fences
        cleaned = re.sub(r'^```(?:json)?|```$', '', text.strip(), flags=re.MULTILINE).strip()
        data = _json.loads(cleaned)
    except Exception:
        data = {'min': 2000, 'max': 8000, 'recommended': 4500,
                'reasoning': text[:120] or 'Estimate based on typical live gig rates.'}
    return data

@api.post("/ai/recommendations")
async def ai_recos(inp: AIRecoIn, u=Depends(get_user)):
    m = await db.musicians.find_one({'user_id': u['id']}) or {}
    q = {'status': 'open'}
    if m.get('city'): q['city'] = m['city']
    gigs = await db.gigs.find(q, {'_id': 0}).limit(50).to_list(50)
    if not gigs:
        gigs = await db.gigs.find({'status': 'open'}, {'_id': 0}).limit(50).to_list(50)
    # Simple scoring
    scored = []
    for g in gigs:
        score = 0
        if g['genre'] in (m.get('genres') or []): score += 3
        if g['instrument_needed'] in (m.get('instruments') or []): score += 3
        if g['city'].lower() == (m.get('city') or '').lower(): score += 2
        exp = m.get('experience_years', 0)
        if g['budget'] >= 3000 + exp * 300: score += 1
        scored.append((score, g))
    scored.sort(key=lambda x: -x[0])
    return [g for _, g in scored[:inp.limit]]

@api.post("/ai/contract/{gig_id}")
async def ai_contract(gig_id: str, u=Depends(get_user)):
    g = await db.gigs.find_one({'id': gig_id}, {'_id': 0})
    if not g: raise HTTPException(404, "Gig not found")
    prompt = (f"Draft a concise performance contract (bullet list, 8-10 clauses) between "
              f"organizer for the event '{g['title']}' on {g['date']} in {g['city']} "
              f"({g['event_type']}) with budget INR {g['budget']}, and the performing artist. "
              "Cover: schedule, payment (50% advance, 50% post-event), equipment, cancellation, "
              "recording rights, force majeure, hospitality, dress code, arrival time. Plain text, no markdown.")
    text = await call_llm("You are a live-events lawyer drafting fair, artist-friendly performance contracts.", prompt)
    return {'contract': text}

# ------------- Stats / Dashboard -------------
@api.get("/dashboard")
async def dashboard(u=Depends(get_user)):
    if u.get('role') == 'organizer':
        gigs = await db.gigs.find({'organizer_id': u['id']}, {'_id': 0}).to_list(500)
        total_apps = 0
        for g in gigs:
            total_apps += await db.applications.count_documents({'gig_id': g['id']})
        return {'active_gigs': len([g for g in gigs if g['status'] == 'open']),
                'total_gigs': len(gigs), 'total_applications': total_apps,
                'total_budget': sum(g['budget'] for g in gigs)}
    else:
        apps = await db.applications.find({'musician_id': u['id']}).to_list(500)
        reviews = await db.reviews.find({'target_user_id': u['id']}).to_list(500)
        rating = round(sum(r['rating'] for r in reviews) / len(reviews), 1) if reviews else 0
        return {'total_applications': len(apps),
                'pending': len([a for a in apps if a['status'] == 'pending']),
                'accepted': len([a for a in apps if a['status'] == 'accepted']),
                'rating': rating, 'reviews': len(reviews)}

# ------------- Seed -------------
@api.post("/seed")
async def seed():
    existing = await db.users.count_documents({})
    if existing > 3:
        return {'seeded': False, 'reason': 'Already has data'}

    # Organizers
    orgs = [
        {'email': 'sunset@stagelink.dev', 'full_name': 'Sunset Sound Co', 'org': 'Sunset Sound Co', 'city': 'Mumbai'},
        {'email': 'nova@stagelink.dev', 'full_name': 'Nova Events', 'org': 'Nova Events', 'city': 'Bengaluru'},
        {'email': 'ember@stagelink.dev', 'full_name': 'Ember Weddings', 'org': 'Ember Weddings', 'city': 'Delhi'},
    ]
    org_ids = []
    for o in orgs:
        uid = str(uuid.uuid4())
        await db.users.insert_one({'id': uid, 'email': o['email'], 'full_name': o['full_name'],
                                   'password_hash': hash_pw('demo1234'), 'role': 'organizer',
                                   'onboarded': True, 'avatar_url': None, 'created_at': now_iso()})
        await db.organizers.insert_one({'user_id': uid, 'org_name': o['org'], 'city': o['city'],
                                        'bio': f"Premium event partners in {o['city']}.",
                                        'updated_at': now_iso()})
        org_ids.append(uid)

    # Musicians
    musicians = [
        {'name': 'Ariya Kapoor', 'city': 'Mumbai', 'genres': ['Jazz', 'Soul'], 'instruments': ['Vocals'], 'exp': 8, 'price': 6000,
         'avatar': 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=400'},
        {'name': 'Kabir Rao', 'city': 'Bengaluru', 'genres': ['Indie', 'Rock'], 'instruments': ['Guitar'], 'exp': 5, 'price': 4500,
         'avatar': 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400'},
        {'name': 'Naina Iyer', 'city': 'Delhi', 'genres': ['Classical', 'Fusion'], 'instruments': ['Violin'], 'exp': 12, 'price': 8500,
         'avatar': 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=400'},
        {'name': 'Rohan Menon', 'city': 'Mumbai', 'genres': ['EDM', 'House'], 'instruments': ['DJ Deck'], 'exp': 6, 'price': 12000,
         'avatar': 'https://images.unsplash.com/photo-1493225255756-d9584f8606e9?w=400'},
        {'name': 'Priya Verma', 'city': 'Bengaluru', 'genres': ['Pop', 'R&B'], 'instruments': ['Vocals', 'Keyboard'], 'exp': 4, 'price': 5500,
         'avatar': 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400'},
    ]
    for m in musicians:
        uid = str(uuid.uuid4())
        await db.users.insert_one({'id': uid, 'email': m['name'].lower().replace(' ', '.') + '@stagelink.dev',
                                   'full_name': m['name'], 'password_hash': hash_pw('demo1234'),
                                   'role': 'musician', 'onboarded': True,
                                   'avatar_url': m['avatar'], 'created_at': now_iso()})
        await db.musicians.insert_one({'user_id': uid, 'bio': f"{m['name']} — {'/'.join(m['genres'])} artist based in {m['city']}.",
                                       'city': m['city'], 'genres': m['genres'], 'instruments': m['instruments'],
                                       'languages': ['English', 'Hindi'], 'experience_years': m['exp'],
                                       'pricing_per_hour': m['price'], 'demo_video_url': None,
                                       'youtube_url': None, 'instagram_url': None,
                                       'avatar_url': m['avatar'], 'updated_at': now_iso()})
        # Seed a review
        await db.reviews.insert_one({'id': str(uuid.uuid4()), 'author_id': org_ids[0],
                                     'target_user_id': uid, 'rating': 5,
                                     'author_name': 'Sunset Sound Co',
                                     'comment': 'Incredible performance, professional and punctual.',
                                     'created_at': now_iso()})

    # Gigs
    gigs = [
        {'title': 'Rooftop Jazz Night', 'city': 'Mumbai', 'event_type': 'club', 'genre': 'Jazz',
         'instrument_needed': 'Vocals', 'budget': 15000,
         'description': 'Sophisticated 3-hour rooftop set for our monthly jazz series. Original + covers welcome.',
         'cover_url': 'https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=800'},
        {'title': 'Beachside Wedding Reception', 'city': 'Mumbai', 'event_type': 'wedding', 'genre': 'Pop',
         'instrument_needed': 'Vocals', 'budget': 45000,
         'description': 'Live acoustic set during cocktail hour + reception. Bollywood + English mix.',
         'cover_url': 'https://images.unsplash.com/photo-1519741497674-611481863552?w=800'},
        {'title': 'Corporate Off-site — Indie Set', 'city': 'Bengaluru', 'event_type': 'corporate', 'genre': 'Indie',
         'instrument_needed': 'Guitar', 'budget': 22000,
         'description': 'Chill 90-minute indie set for a tech company off-site. Sound provided.',
         'cover_url': 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800'},
        {'title': 'Diwali Fusion Concert', 'city': 'Delhi', 'event_type': 'festival', 'genre': 'Fusion',
         'instrument_needed': 'Violin', 'budget': 38000,
         'description': 'Headline slot at our annual Diwali arts festival. 45 min set.',
         'cover_url': 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800'},
        {'title': 'Warehouse EDM Night', 'city': 'Mumbai', 'event_type': 'club', 'genre': 'EDM',
         'instrument_needed': 'DJ Deck', 'budget': 30000,
         'description': 'Underground 2-hour set at a converted warehouse space. High-end CDJ setup ready.',
         'cover_url': 'https://images.unsplash.com/photo-1571266028243-e4bb35f01e9d?w=800'},
        {'title': 'Cafe Sundowner Series', 'city': 'Bengaluru', 'event_type': 'private', 'genre': 'Soul',
         'instrument_needed': 'Vocals', 'budget': 8000,
         'description': 'Weekly Sunday evening 2-hour acoustic set. Ongoing residency possible.',
         'cover_url': 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800'},
        {'title': 'Sangeet Night', 'city': 'Delhi', 'event_type': 'wedding', 'genre': 'Pop',
         'instrument_needed': 'Keyboard', 'budget': 28000,
         'description': 'Live band for pre-wedding sangeet. Bollywood dance floor essential.',
         'cover_url': 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800'},
        {'title': 'Startup Launch Party', 'city': 'Bengaluru', 'event_type': 'corporate', 'genre': 'R&B',
         'instrument_needed': 'Vocals', 'budget': 18000,
         'description': 'Live vocals + DJ hybrid for 200-guest launch event. 2-hour set.',
         'cover_url': 'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=800'},
    ]
    for i, g in enumerate(gigs):
        gid = str(uuid.uuid4())
        future = (datetime.now(timezone.utc) + timedelta(days=7 + i * 5)).date().isoformat()
        await db.gigs.insert_one({**g, 'id': gid, 'organizer_id': org_ids[i % len(org_ids)],
                                  'date': future, 'status': 'open', 'created_at': now_iso(),
                                  'featured': i < 2})
    return {'seeded': True, 'gigs': len(gigs), 'musicians': len(musicians)}

# ------------- Root -------------
@api.get("/")
async def root():
    return {'app': 'StageLink API', 'version': '1.0'}

app.include_router(api)

app.add_middleware(
    CORSMiddleware, allow_credentials=True, allow_origins=["*"],
    allow_methods=["*"], allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

@app.on_event("startup")
async def startup():
    # Auto-seed
    try:
        count = await db.users.count_documents({})
        if count == 0:
            await seed()
    except Exception as e:
        logging.exception("Seed error: %s", e)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
