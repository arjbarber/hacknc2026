import os
from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
import jwt
import psycopg
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")
load_dotenv()

# We import supabase lazily or handle missing client gracefully
try:
    from supabase import create_client, Client
    from supabase_auth.errors import AuthApiError, AuthError
except ImportError:
    create_client = None
    Client = Any
    AuthApiError = Exception
    AuthError = Exception

router = APIRouter(prefix="/auth", tags=["Authentication"])
security = HTTPBearer(auto_error=False)

_supabase_client: Optional[Any] = None
_supabase_admin_client: Optional[Any] = None


def is_supabase_configured() -> bool:
    """Checks whether valid Supabase credentials are configured in the environment."""
    url = os.getenv("SUPABASE_URL", "").strip()
    key = (os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_ANON_KEY") or "").strip()
    if not url or not key:
        return False
    # Check for unedited placeholder templates
    if "your-project" in url or "your-supabase" in key or "example.supabase.co" in url:
        return False
    return True


def get_supabase_client():
    """Returns an initialized Supabase client using anon/public key."""
    global _supabase_client
    if not is_supabase_configured():
        raise HTTPException(
            status_code=503,
            detail="Supabase credentials are not configured. Please set SUPABASE_URL and SUPABASE_KEY in backend/.env",
        )
    if _supabase_client is None:
        url = os.getenv("SUPABASE_URL", "").strip()
        key = (os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_ANON_KEY") or "").strip()
        _supabase_client = create_client(url, key)
    return _supabase_client


def get_supabase_admin_client():
    """Returns an initialized Supabase admin client using service_role key, or falls back to public client."""
    global _supabase_admin_client
    if not is_supabase_configured():
        raise HTTPException(
            status_code=503,
            detail="Supabase credentials are not configured. Please set SUPABASE_URL and SUPABASE_KEY in backend/.env",
        )
    if _supabase_admin_client is None:
        url = os.getenv("SUPABASE_URL", "").strip()
        admin_key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
        if admin_key and "your-supabase" not in admin_key:
            _supabase_admin_client = create_client(url, admin_key)
        else:
            _supabase_admin_client = get_supabase_client()
    return _supabase_admin_client


def sync_user_to_db(user_id: str, email: Optional[str] = None, name: Optional[str] = None) -> None:
    """Ensures a user row exists in the PostgreSQL/TimescaleDB users table."""
    db_url = os.getenv("TIGER_DATABASE_URL")
    if not db_url or not user_id:
        return
    try:
        display_name = name or (email.split("@")[0] if email else user_id)
        with psycopg.connect(db_url) as conn:
            with conn.cursor() as cur:
                try:
                    cur.execute(
                        """
                        INSERT INTO users (id, name, email, cash)
                        VALUES (%s, %s, %s, 100000.0)
                        ON CONFLICT (id) DO UPDATE SET
                            name = COALESCE(EXCLUDED.name, users.name),
                            email = COALESCE(EXCLUDED.email, users.email);
                        """,
                        (user_id, display_name, email),
                    )
                except psycopg.Error:
                    conn.rollback()
                    # Fallback in case email column was not yet added
                    cur.execute(
                        """
                        INSERT INTO users (id, name, cash)
                        VALUES (%s, %s, 100000.0)
                        ON CONFLICT (id) DO NOTHING;
                        """,
                        (user_id, display_name),
                    )
            conn.commit()
    except Exception as e:
        print(f"sync_user_to_db warning for {user_id}: {e}")


def verify_token(token: str) -> Dict[str, Any]:
    """
    Validates a Supabase JWT access token.
    Tries the Supabase Auth server first, with fallback to local JWT verification
    if SUPABASE_JWT_SECRET is configured.
    """
    if not token:
        raise HTTPException(status_code=401, detail="Authentication token is required")

    # 1. Try Supabase Auth API
    if is_supabase_configured():
        client = get_supabase_client()
        try:
            res = client.auth.get_user(token)
            if res and res.user:
                u = res.user
                user_meta = u.user_metadata or {}
                display_name = user_meta.get("name") or user_meta.get("full_name") or (u.email.split("@")[0] if u.email else u.id)
                sync_user_to_db(u.id, u.email, display_name)
                return {
                    "id": str(u.id),
                    "email": u.email,
                    "name": display_name,
                    "user_metadata": user_meta,
                    "app_metadata": u.app_metadata or {},
                }
        except AuthApiError as e:
            raise HTTPException(status_code=401, detail=f"Authentication failed: {e.message}")
        except Exception as e:
            # If network error or temporary issue, proceed to try offline JWT verification
            pass

    # 2. Offline JWT verification if secret is provided
    jwt_secret = os.getenv("SUPABASE_JWT_SECRET", "").strip()
    if jwt_secret and "your-supabase" not in jwt_secret and not jwt_secret.startswith("http"):
        try:
            payload = jwt.decode(token, jwt_secret, algorithms=["HS256"], audience="authenticated")
            user_id = payload.get("sub")
            if not user_id:
                raise HTTPException(status_code=401, detail="Invalid token: missing subject")
            email = payload.get("email")
            user_meta = payload.get("user_metadata") or {}
            display_name = user_meta.get("name") or (email.split("@")[0] if email else user_id)
            sync_user_to_db(user_id, email, display_name)
            return {
                "id": str(user_id),
                "email": email,
                "name": display_name,
                "user_metadata": user_meta,
                "app_metadata": payload.get("app_metadata") or {},
            }
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token has expired")
        except jwt.InvalidTokenError as e:
            raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    # If neither worked
    if not is_supabase_configured():
        raise HTTPException(
            status_code=503,
            detail="Supabase credentials are not configured in backend/.env",
        )
    raise HTTPException(status_code=401, detail="Invalid or expired authentication token")


def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Security(security)) -> Dict[str, Any]:
    """Dependency that enforces a valid Authorization: Bearer <token> header."""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=401,
            detail="Missing Authorization Bearer header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return verify_token(credentials.credentials)


def get_optional_user(credentials: Optional[HTTPAuthorizationCredentials] = Security(security)) -> Optional[Dict[str, Any]]:
    """Dependency that extracts user if Authorization header is present and valid, returns None otherwise."""
    if not credentials or not credentials.credentials:
        return None
    try:
        return verify_token(credentials.credentials)
    except HTTPException:
        return None


# --- Pydantic Request Models ---

class SignUpRequest(BaseModel):
    email: str = Field(..., description="User email address")
    password: str = Field(..., min_length=6, description="User password (min 6 characters)")
    name: Optional[str] = Field(None, description="Optional display name")


class LoginRequest(BaseModel):
    email: str = Field(..., description="User email address")
    password: str = Field(..., description="User password")


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(..., description="Supabase refresh token")


class ResetPasswordRequest(BaseModel):
    email: str = Field(..., description="Email address to send password reset link")
    redirect_to: Optional[str] = Field(None, description="URL to redirect the user to after reset")


class UpdatePasswordRequest(BaseModel):
    password: str = Field(..., min_length=6, description="New password (min 6 characters)")


class GoogleIdTokenRequest(BaseModel):
    id_token: str = Field(..., description="Google ID token (from Google One Tap or Google Sign-In SDK)")
    nonce: Optional[str] = Field(None, description="Optional cryptographic nonce")


class GoogleOAuthUrlRequest(BaseModel):
    redirect_to: Optional[str] = Field(None, description="Frontend URL to redirect after Google OAuth authentication")


class ExchangeCodeRequest(BaseModel):
    auth_code: str = Field(..., description="OAuth code from Supabase redirect callback")


class UpdateProfileRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Display name for Tiger Data profile")


# --- Auth Endpoints ---

@router.post("/signup")
def sign_up(body: SignUpRequest):
    """Register a new user in Supabase Auth and initialize user in database."""
    client = get_supabase_client()
    try:
        options = {}
        if body.name:
            options["data"] = {"name": body.name}

        credentials = {
            "email": body.email,
            "password": body.password,
        }
        if options:
            credentials["options"] = options

        res = client.auth.sign_up(credentials)
        if not res or not res.user:
            raise HTTPException(status_code=400, detail="Failed to create user")

        user_id = str(res.user.id)
        display_name = body.name or body.email.split("@")[0]
        sync_user_to_db(user_id, res.user.email, display_name)

        session_data = None
        if res.session:
            session_data = {
                "access_token": res.session.access_token,
                "refresh_token": res.session.refresh_token,
                "token_type": res.session.token_type,
                "expires_in": res.session.expires_in,
                "expires_at": res.session.expires_at,
            }

        return {
            "status": "success",
            "message": "User registered successfully" if session_data else "Registration successful. Please check your email to verify your account.",
            "user": {
                "id": user_id,
                "email": res.user.email,
                "name": display_name,
            },
            "session": session_data,
        }
    except AuthApiError as e:
        raise HTTPException(status_code=getattr(e, "status", 400) or 400, detail=e.message)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")


@router.post("/login")
def login(body: LoginRequest):
    """Authenticate a user with email and password via Supabase."""
    client = get_supabase_client()
    try:
        res = client.auth.sign_in_with_password({
            "email": body.email,
            "password": body.password,
        })
        if not res or not res.user or not res.session:
            raise HTTPException(status_code=401, detail="Invalid email or password")

        user_id = str(res.user.id)
        user_meta = res.user.user_metadata or {}
        display_name = user_meta.get("name") or user_meta.get("full_name") or body.email.split("@")[0]
        sync_user_to_db(user_id, res.user.email, display_name)

        # Retrieve user cash balance if database is available
        cash = 100000.0
        db_url = os.getenv("TIGER_DATABASE_URL")
        if db_url:
            try:
                with psycopg.connect(db_url) as conn:
                    with conn.cursor() as cur:
                        cur.execute("SELECT cash FROM users WHERE id = %s", (user_id,))
                        row = cur.fetchone()
                        if row:
                            cash = float(row[0])
            except Exception:
                pass

        return {
            "status": "success",
            "user": {
                "id": user_id,
                "email": res.user.email,
                "name": display_name,
                "cash": cash,
            },
            "session": {
                "access_token": res.session.access_token,
                "refresh_token": res.session.refresh_token,
                "token_type": res.session.token_type,
                "expires_in": res.session.expires_in,
                "expires_at": res.session.expires_at,
            },
        }
    except AuthApiError as e:
        raise HTTPException(status_code=getattr(e, "status", 401) or 401, detail=e.message)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")


@router.post("/logout")
def logout(credentials: Optional[HTTPAuthorizationCredentials] = Security(security)):
    """Log out user from Supabase."""
    if not is_supabase_configured():
        return {"status": "success", "message": "Logged out"}
    try:
        client = get_supabase_client()
        if credentials and credentials.credentials:
            client.auth.sign_out({"jwt": credentials.credentials})
        else:
            client.auth.sign_out()
    except Exception:
        pass
    return {"status": "success", "message": "Logged out successfully"}


@router.post("/refresh")
def refresh_session(body: RefreshTokenRequest):
    """Refresh an access token using a refresh token."""
    client = get_supabase_client()
    try:
        res = client.auth.refresh_session(body.refresh_token)
        if not res or not res.session:
            raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

        return {
            "status": "success",
            "session": {
                "access_token": res.session.access_token,
                "refresh_token": res.session.refresh_token,
                "token_type": res.session.token_type,
                "expires_in": res.session.expires_in,
                "expires_at": res.session.expires_at,
            },
            "user": {
                "id": str(res.user.id),
                "email": res.user.email,
            } if res.user else None,
        }
    except AuthApiError as e:
        raise HTTPException(status_code=getattr(e, "status", 401) or 401, detail=e.message)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Token refresh failed: {str(e)}")


@router.get("/me")
@router.get("/user")
def get_me(user: Dict[str, Any] = Depends(get_current_user)):
    """Get the current authenticated user's profile and account overview."""
    user_id = user["id"]
    db_url = os.getenv("TIGER_DATABASE_URL")
    account_info = {"cash": 100000.0, "position_count": 0, "order_count": 0}

    if db_url:
        try:
            with psycopg.connect(db_url) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT cash, name FROM users WHERE id = %s", (user_id,))
                    row = cur.fetchone()
                    if row:
                        account_info["cash"] = float(row[0])
                        if row[1]:
                            user["name"] = row[1]
                    cur.execute("SELECT COUNT(*) FROM positions WHERE user_id = %s", (user_id,))
                    p_row = cur.fetchone()
                    if p_row:
                        account_info["position_count"] = p_row[0]
                    cur.execute("SELECT COUNT(*) FROM orders WHERE user_id = %s", (user_id,))
                    o_row = cur.fetchone()
                    if o_row:
                        account_info["order_count"] = o_row[0]
        except Exception as e:
            print(f"Error fetching account info for {user_id}: {e}")

    return {
        "status": "success",
        "user": user,
        "account": account_info,
    }


@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest):
    """Send a password reset email to the user."""
    client = get_supabase_client()
    try:
        options = {}
        if body.redirect_to:
            options["redirect_to"] = body.redirect_to
        client.auth.reset_password_for_email(body.email, options=options)
        return {"status": "success", "message": "If the account exists, a password reset link has been sent."}
    except AuthApiError as e:
        raise HTTPException(status_code=getattr(e, "status", 400) or 400, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Password reset failed: {str(e)}")


@router.post("/update-password")
def update_password(body: UpdatePasswordRequest, user: Dict[str, Any] = Depends(get_current_user)):
    """Update password for the currently logged-in user."""
    client = get_supabase_client()
    try:
        client.auth.update_user({"password": body.password})
        return {"status": "success", "message": "Password updated successfully"}
    except AuthApiError as e:
        raise HTTPException(status_code=getattr(e, "status", 400) or 400, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Password update failed: {str(e)}")


@router.put("/profile")
def update_profile(body: UpdateProfileRequest, user: Dict[str, Any] = Depends(get_current_user)):
    """Update user display name in Tiger Data users table and sync metadata."""
    user_id = user["id"]
    new_name = body.name.strip()
    db_url = os.getenv("TIGER_DATABASE_URL")
    if db_url:
        try:
            with psycopg.connect(db_url) as conn:
                with conn.cursor() as cur:
                    cur.execute("UPDATE users SET name = %s WHERE id = %s", (new_name, user_id))
                conn.commit()
        except Exception as e:
            print(f"Failed to update profile name in Tiger Data: {e}")

    # Also update Supabase metadata if client is available
    if is_supabase_configured():
        try:
            client = get_supabase_client()
            client.auth.update_user({"data": {"name": new_name}})
        except Exception:
            pass

    user["name"] = new_name
    return {"status": "success", "user": user}


@router.get("/google/url")
@router.post("/google/url")
def get_google_oauth_url(redirect_to: Optional[str] = None, body: Optional[GoogleOAuthUrlRequest] = None):
    """
    Generate the Google OAuth sign-in URL.
    The client can redirect the user to this URL to initiate Google Sign-In via Supabase.
    """
    client = get_supabase_client()
    try:
        target_redirect = (body.redirect_to if body and body.redirect_to else redirect_to) or os.getenv("NEXT_PUBLIC_API_URL") or "http://localhost:3000"
        res = client.auth.sign_in_with_oauth({
            "provider": "google",
            "options": {
                "redirect_to": target_redirect,
            },
        })
        return {
            "status": "success",
            "provider": "google",
            "url": res.url,
        }
    except AuthApiError as e:
        raise HTTPException(status_code=getattr(e, "status", 400) or 400, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate Google OAuth URL: {str(e)}")


@router.post("/google")
@router.post("/google/id-token")
def sign_in_with_google_id_token(body: GoogleIdTokenRequest):
    """
    Sign in with a Google ID token (e.g. from Google One Tap or Google Sign-In web button).
    Exchanges the token for a full Supabase session and synchronizes the user into the database.
    """
    client = get_supabase_client()
    try:
        credentials = {
            "provider": "google",
            "token": body.id_token,
        }
        if body.nonce:
            credentials["nonce"] = body.nonce

        res = client.auth.sign_in_with_id_token(credentials)
        if not res or not res.user or not res.session:
            raise HTTPException(status_code=401, detail="Google authentication failed")

        user_id = str(res.user.id)
        user_meta = res.user.user_metadata or {}
        display_name = user_meta.get("name") or user_meta.get("full_name") or (res.user.email.split("@")[0] if res.user.email else user_id)
        sync_user_to_db(user_id, res.user.email, display_name)

        # Retrieve user cash balance if database is available
        cash = 100000.0
        db_url = os.getenv("TIGER_DATABASE_URL")
        if db_url:
            try:
                with psycopg.connect(db_url) as conn:
                    with conn.cursor() as cur:
                        cur.execute("SELECT cash FROM users WHERE id = %s", (user_id,))
                        row = cur.fetchone()
                        if row:
                            cash = float(row[0])
            except Exception:
                pass

        return {
            "status": "success",
            "user": {
                "id": user_id,
                "email": res.user.email,
                "name": display_name,
                "avatar_url": user_meta.get("avatar_url") or user_meta.get("picture"),
                "cash": cash,
            },
            "session": {
                "access_token": res.session.access_token,
                "refresh_token": res.session.refresh_token,
                "token_type": res.session.token_type,
                "expires_in": res.session.expires_in,
                "expires_at": res.session.expires_at,
            },
        }
    except AuthApiError as e:
        raise HTTPException(status_code=getattr(e, "status", 401) or 401, detail=e.message)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Google login failed: {str(e)}")


@router.post("/exchange-code")
def exchange_code(body: ExchangeCodeRequest):
    """
    Exchange an OAuth authorization code from a Supabase redirect for a session.
    """
    client = get_supabase_client()
    try:
        res = client.auth.exchange_code_for_session({"auth_code": body.auth_code})
        if not res or not res.user or not res.session:
            raise HTTPException(status_code=401, detail="Failed to exchange authorization code")

        user_id = str(res.user.id)
        user_meta = res.user.user_metadata or {}
        display_name = user_meta.get("name") or user_meta.get("full_name") or (res.user.email.split("@")[0] if res.user.email else user_id)
        sync_user_to_db(user_id, res.user.email, display_name)

        return {
            "status": "success",
            "user": {
                "id": user_id,
                "email": res.user.email,
                "name": display_name,
            },
            "session": {
                "access_token": res.session.access_token,
                "refresh_token": res.session.refresh_token,
                "token_type": res.session.token_type,
                "expires_in": res.session.expires_in,
                "expires_at": res.session.expires_at,
            },
        }
    except AuthApiError as e:
        raise HTTPException(status_code=getattr(e, "status", 400) or 400, detail=e.message)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Code exchange failed: {str(e)}")
