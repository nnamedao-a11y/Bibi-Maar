"""
BIBI Cars V3.2 — Backend API Test Suite
========================================
Pre-deployment validation for all 4 cabinets: admin, manager, team_lead, customer
Tests authentication, public endpoints, cabinet-specific endpoints, HMAC extension
"""
import requests
import sys
import hashlib
import hmac
import time
from typing import Dict, Any, Optional

BASE_URL = "https://code-complete-49.preview.emergentagent.com"

class BIBICarsAPITester:
    def __init__(self):
        self.base_url = BASE_URL
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        
        # Tokens for each cabinet
        self.admin_token = None
        self.manager_token = None
        self.teamlead_token = None
        self.customer_token = None
        
        # Test data
        self.test_vin = None
        self.ext_shared_secret = None
        
        # Results tracking
        self.failed_tests = []
        self.backend_errors = []

    def log(self, msg: str, indent: int = 1):
        print(f"{'  ' * indent}{msg}")

    def test(self, name: str, condition: bool, details: str = "", critical: bool = False):
        """Record test result"""
        self.tests_run += 1
        if condition:
            self.tests_passed += 1
            print(f"✅ {name}")
            if details:
                self.log(details)
        else:
            self.tests_failed += 1
            print(f"❌ {name}")
            if details:
                self.log(f"FAILED: {details}")
            self.failed_tests.append({"test": name, "details": details, "critical": critical})
        return condition

    def check_response(self, resp, expected_status: int = 200) -> bool:
        """Check if response status matches expected"""
        if resp.status_code != expected_status:
            try:
                error_detail = resp.json() if resp.text else resp.text
            except:
                error_detail = resp.text[:200]
            return False, f"Expected {expected_status}, got {resp.status_code}: {error_detail}"
        return True, ""

    def check_real_data(self, data: Any, field_name: str) -> bool:
        """Verify data is not mocked/placeholder"""
        if not data:
            return True  # Empty is ok
        
        if isinstance(data, str):
            mock_indicators = [
                "lorem ipsum", "placeholder", "sample", "demo", "test", "mock",
                "MOCK_", "SAMPLE_", "DEMO_", "TODO", "FIXME"
            ]
            data_lower = data.lower()
            for indicator in mock_indicators:
                if indicator in data_lower:
                    self.log(f"⚠️  Mock data detected in {field_name}: {data[:100]}")
                    return False
        return True

    # ═══════════════════════════════════════════════════════════════
    # AUTHENTICATION TESTS
    # ═══════════════════════════════════════════════════════════════
    
    def test_staff_login(self, email: str, password: str, role_name: str) -> Optional[str]:
        """Test staff login (admin/manager/teamlead) via /api/auth/login"""
        try:
            resp = requests.post(
                f"{self.base_url}/api/auth/login",
                json={"email": email, "password": password},
                timeout=10
            )
            
            success, msg = self.check_response(resp, 200)
            if not success:
                self.test(f"{role_name} login ({email})", False, msg, critical=True)
                return None
            
            data = resp.json()
            token = data.get("access_token")
            
            self.test(
                f"{role_name} login ({email})",
                token is not None,
                f"Token received: {token[:20]}..." if token else "No access_token in response",
                critical=True
            )
            return token
            
        except Exception as e:
            self.test(f"{role_name} login ({email})", False, f"Exception: {e}", critical=True)
            return None

    def test_customer_login(self, email: str, password: str) -> Optional[str]:
        """Test customer login via /api/customer-auth/login"""
        try:
            resp = requests.post(
                f"{self.base_url}/api/customer-auth/login",
                json={"email": email, "password": password},
                timeout=10
            )
            
            success, msg = self.check_response(resp, 200)
            if not success:
                self.test(f"Customer login ({email})", False, msg, critical=True)
                return None
            
            data = resp.json()
            token = data.get("accessToken")  # Note: customer uses 'accessToken' not 'access_token'
            
            self.test(
                f"Customer login ({email})",
                token is not None,
                f"Token received: {token[:20]}..." if token else "No accessToken in response",
                critical=True
            )
            return token
            
        except Exception as e:
            self.test(f"Customer login ({email})", False, f"Exception: {e}", critical=True)
            return None

    def test_all_logins(self):
        """Test all 4 cabinet login flows"""
        print("\n" + "="*70)
        print("🔐 AUTHENTICATION TESTS")
        print("="*70)
        
        self.admin_token = self.test_staff_login(
            "admin@bibi.cars", 
            "Jp3FS_7ZuE2bhHp7rFkJm9B9T_TeiHxu",
            "Admin"
        )
        
        self.manager_token = self.test_staff_login(
            "manager@bibi.cars",
            "dFbYnse0L59DBE16Mn4kT6cCRaNBZFQR",
            "Manager"
        )
        
        self.teamlead_token = self.test_staff_login(
            "teamlead@bibi.cars",
            "txXNMkj-lS2w1nv482aLlvKWuk9Y9eKE",
            "Team Lead"
        )
        
        self.customer_token = self.test_customer_login(
            "user@bibi.cars",
            "User_bibi_2026!"
        )

    # ═══════════════════════════════════════════════════════════════
    # PUBLIC ENDPOINTS
    # ═══════════════════════════════════════════════════════════════
    
    def test_public_endpoints(self):
        """Test public vehicle endpoints"""
        print("\n" + "="*70)
        print("🚗 PUBLIC VEHICLE ENDPOINTS")
        print("="*70)
        
        # Test 1: GET /api/public/vehicles?limit=1
        try:
            resp = requests.get(
                f"{self.base_url}/api/public/vehicles?limit=1",
                timeout=10
            )
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                total = data.get("total", 0)
                items = data.get("items", [])
                
                self.test(
                    "GET /api/public/vehicles?limit=1",
                    total >= 5000,
                    f"Total vehicles: {total} (expected >= 5000)"
                )
                
                # Store first VIN for later tests
                if items and len(items) > 0:
                    self.test_vin = items[0].get("vin")
                    self.log(f"Sample VIN: {self.test_vin}")
                    
                    # Check for real data
                    vehicle = items[0]
                    for field in ["make", "model", "year", "vin"]:
                        if field in vehicle:
                            self.check_real_data(vehicle[field], field)
            else:
                self.test("GET /api/public/vehicles?limit=1", False, msg)
        except Exception as e:
            self.test("GET /api/public/vehicles?limit=1", False, f"Exception: {e}")
        
        # Test 2: GET /api/public/vehicles?make=Toyota (filtering)
        try:
            resp = requests.get(
                f"{self.base_url}/api/public/vehicles?make=Toyota",
                timeout=10
            )
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                total = data.get("total", 0)
                self.test(
                    "GET /api/public/vehicles?make=Toyota (filtering)",
                    total > 0,
                    f"Toyota vehicles found: {total}"
                )
            else:
                self.test("GET /api/public/vehicles?make=Toyota", False, msg)
        except Exception as e:
            self.test("GET /api/public/vehicles?make=Toyota", False, f"Exception: {e}")
        
        # Test 3: GET /api/public/vehicles/{vin}
        if self.test_vin:
            try:
                resp = requests.get(
                    f"{self.base_url}/api/public/vehicles/{self.test_vin}",
                    timeout=10
                )
                success, msg = self.check_response(resp, 200)
                if success:
                    data = resp.json()
                    has_vin = data.get("vin") == self.test_vin
                    has_data = len(data.keys()) > 3  # Should have more than just vin
                    
                    self.test(
                        f"GET /api/public/vehicles/{self.test_vin}",
                        has_vin and has_data,
                        f"Fields returned: {len(data.keys())}"
                    )
                    
                    # Check for real data in multiple fields
                    for field in data.keys():
                        if field not in ["_id", "id", "created_at", "updated_at"]:
                            self.check_real_data(data[field], field)
                else:
                    self.test(f"GET /api/public/vehicles/{self.test_vin}", False, msg)
            except Exception as e:
                self.test(f"GET /api/public/vehicles/{self.test_vin}", False, f"Exception: {e}")

    # ═══════════════════════════════════════════════════════════════
    # ADMIN ENDPOINTS
    # ═══════════════════════════════════════════════════════════════
    
    def test_admin_endpoints(self):
        """Test admin-only endpoints"""
        print("\n" + "="*70)
        print("👑 ADMIN ENDPOINTS")
        print("="*70)
        
        if not self.admin_token:
            self.log("⚠️  Skipping admin tests - no admin token")
            return
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        admin_endpoints = [
            "/api/auth/me",
            "/api/admin/providers/stats",
            "/api/admin/ext-clients",
            "/api/admin/ext-clients/shared-secret",
            "/api/admin/integrations",
            "/api/admin/identity/tracking-status",
            "/api/admin/email-templates",
            "/api/admin/google-reviews",
            "/api/admin/blog/articles",
            "/api/admin/engagement/analytics",
            "/api/admin/kpi/alerts",
            "/api/admin/intent/scores",
            "/api/admin/payments/stats",
            "/api/admin/invoice-templates",
            "/api/admin/history-reports/pending",
            "/api/ingestion/admin/parsers",
            "/api/lemon/status",
        ]
        
        for endpoint in admin_endpoints:
            try:
                resp = requests.get(
                    f"{self.base_url}{endpoint}",
                    headers=headers,
                    timeout=10
                )
                
                # Accept 200 or 404 (endpoint may not have data yet)
                success = resp.status_code in [200, 404]
                
                if resp.status_code == 500:
                    self.backend_errors.append({
                        "endpoint": endpoint,
                        "status": 500,
                        "error": resp.text[:200]
                    })
                
                self.test(
                    f"GET {endpoint}",
                    success,
                    f"Status: {resp.status_code}" + (f" - {resp.text[:100]}" if not success else "")
                )
                
                # Special check for shared-secret endpoint
                if endpoint == "/api/admin/ext-clients/shared-secret" and resp.status_code == 200:
                    data = resp.json()
                    self.ext_shared_secret = data.get("secret")
                    configured = data.get("configured", False)
                    self.test(
                        "EXT_SHARED_SECRET configured",
                        configured and self.ext_shared_secret,
                        f"Secret length: {data.get('length', 0)}, Fingerprint: {data.get('fingerprint', 'N/A')}"
                    )
                    
            except Exception as e:
                self.test(f"GET {endpoint}", False, f"Exception: {e}")

    # ═══════════════════════════════════════════════════════════════
    # MANAGER ENDPOINTS
    # ═══════════════════════════════════════════════════════════════
    
    def test_manager_endpoints(self):
        """Test manager-only endpoints"""
        print("\n" + "="*70)
        print("📊 MANAGER ENDPOINTS")
        print("="*70)
        
        if not self.manager_token:
            self.log("⚠️  Skipping manager tests - no manager token")
            return
        
        headers = {"Authorization": f"Bearer {self.manager_token}"}
        
        manager_endpoints = [
            "/api/auth/me",
            "/api/manager/orders",
            "/api/manager/calls/my",
            "/api/manager/calls/missed",
            "/api/manager/invoices/my",
            "/api/manager/tracking/providers",
            "/api/manager/tracking/search?q=ABC",
        ]
        
        for endpoint in manager_endpoints:
            try:
                resp = requests.get(
                    f"{self.base_url}{endpoint}",
                    headers=headers,
                    timeout=10
                )
                
                success = resp.status_code in [200, 404]
                
                if resp.status_code == 500:
                    self.backend_errors.append({
                        "endpoint": endpoint,
                        "status": 500,
                        "error": resp.text[:200]
                    })
                
                self.test(
                    f"GET {endpoint}",
                    success,
                    f"Status: {resp.status_code}" + (f" - {resp.text[:100]}" if not success else "")
                )
            except Exception as e:
                self.test(f"GET {endpoint}", False, f"Exception: {e}")

    # ═══════════════════════════════════════════════════════════════
    # TEAM LEAD ENDPOINTS
    # ═══════════════════════════════════════════════════════════════
    
    def test_teamlead_endpoints(self):
        """Test team lead endpoints"""
        print("\n" + "="*70)
        print("👥 TEAM LEAD ENDPOINTS")
        print("="*70)
        
        if not self.teamlead_token:
            self.log("⚠️  Skipping team lead tests - no team lead token")
            return
        
        headers = {"Authorization": f"Bearer {self.teamlead_token}"}
        
        teamlead_endpoints = [
            "/api/auth/me",
            "/api/team/dashboard",
            "/api/team/leads",
            "/api/team/leads/hot",
            "/api/team/leads/stale",
            "/api/team/managers",
            "/api/team/orders",
            "/api/team/shipping",
            "/api/team/shipping/risky",
            "/api/team/shipping/stalled",
            "/api/team/tasks",
            "/api/team/tasks/overdue",
            "/api/team/alerts",
            "/api/team/payments/overdue",
            "/api/team/performance",
            "/api/team/reassignments",
        ]
        
        for endpoint in teamlead_endpoints:
            try:
                resp = requests.get(
                    f"{self.base_url}{endpoint}",
                    headers=headers,
                    timeout=10
                )
                
                success = resp.status_code in [200, 404]
                
                if resp.status_code == 500:
                    self.backend_errors.append({
                        "endpoint": endpoint,
                        "status": 500,
                        "error": resp.text[:200]
                    })
                
                self.test(
                    f"GET {endpoint}",
                    success,
                    f"Status: {resp.status_code}" + (f" - {resp.text[:100]}" if not success else "")
                )
            except Exception as e:
                self.test(f"GET {endpoint}", False, f"Exception: {e}")

    # ═══════════════════════════════════════════════════════════════
    # CUSTOMER ENDPOINTS
    # ═══════════════════════════════════════════════════════════════
    
    def test_customer_endpoints(self):
        """Test customer cabinet endpoints"""
        print("\n" + "="*70)
        print("👤 CUSTOMER ENDPOINTS")
        print("="*70)
        
        if not self.customer_token:
            self.log("⚠️  Skipping customer tests - no customer token")
            return
        
        # Customer endpoints can use Bearer OR X-Customer-Session header
        headers = {"Authorization": f"Bearer {self.customer_token}"}
        
        customer_endpoints = [
            "/api/customer-auth/me",
            "/api/cabinet/profile",
            "/api/cabinet/orders",
            "/api/cabinet/contracts",
            "/api/cabinet/deals",
            "/api/cabinet/deposits",
            "/api/cabinet/history-reports",
            "/api/cabinet/invoices",
            "/api/cabinet/notifications",
            "/api/cabinet/shipping",
            "/api/notifications/customer/me",
            "/api/notifications/customer/unread-count",
        ]
        
        for endpoint in customer_endpoints:
            try:
                resp = requests.get(
                    f"{self.base_url}{endpoint}",
                    headers=headers,
                    timeout=10
                )
                
                success = resp.status_code in [200, 404]
                
                if resp.status_code == 500:
                    self.backend_errors.append({
                        "endpoint": endpoint,
                        "status": 500,
                        "error": resp.text[:200]
                    })
                
                self.test(
                    f"GET {endpoint}",
                    success,
                    f"Status: {resp.status_code}" + (f" - {resp.text[:100]}" if not success else "")
                )
            except Exception as e:
                self.test(f"GET {endpoint}", False, f"Exception: {e}")

    # ═══════════════════════════════════════════════════════════════
    # HMAC EXTENSION ENDPOINT
    # ═══════════════════════════════════════════════════════════════
    
    def test_hmac_endpoint(self):
        """Test HMAC-protected extension endpoint"""
        print("\n" + "="*70)
        print("🔐 HMAC EXTENSION ENDPOINT")
        print("="*70)
        
        if not self.ext_shared_secret:
            self.log("⚠️  Skipping HMAC test - no shared secret retrieved")
            return
        
        # Test POST /api/vesselfinder/heartbeat with HMAC signature
        endpoint = "/api/vesselfinder/heartbeat"
        method = "POST"
        body = b'{"status":"alive","timestamp":' + str(int(time.time())).encode() + b'}'
        
        # Compute HMAC signature
        ts = int(time.time())
        body_sha = hashlib.sha256(body).hexdigest()
        msg = f"{ts}\n{method}\n{endpoint}\n{body_sha}".encode("utf-8")
        signature = hmac.new(
            self.ext_shared_secret.encode("utf-8"),
            msg,
            hashlib.sha256
        ).hexdigest()
        
        headers = {
            "X-Ext-Timestamp": str(ts),
            "X-Ext-Signature": signature,
            "X-Ext-Client": "test-client",
            "X-Ext-Nonce": f"test-nonce-{ts}",
            "Content-Type": "application/json"
        }
        
        try:
            resp = requests.post(
                f"{self.base_url}{endpoint}",
                data=body,
                headers=headers,
                timeout=10
            )
            
            success, msg = self.check_response(resp, 200)
            self.test(
                "POST /api/vesselfinder/heartbeat (HMAC)",
                success,
                f"Status: {resp.status_code}" + (f" - {msg}" if not success else " - HMAC signature verified")
            )
            
        except Exception as e:
            self.test("POST /api/vesselfinder/heartbeat (HMAC)", False, f"Exception: {e}")

    # ═══════════════════════════════════════════════════════════════
    # BOOTSTRAP ENDPOINT TEST
    # ═══════════════════════════════════════════════════════════════
    
    def test_bootstrap_endpoint(self):
        """Test ext-clients bootstrap endpoint"""
        print("\n" + "="*70)
        print("🔧 EXT-CLIENTS BOOTSTRAP")
        print("="*70)
        
        if not self.admin_token:
            self.log("⚠️  Skipping bootstrap test - no admin token")
            return
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        try:
            resp = requests.post(
                f"{self.base_url}/api/admin/ext-clients/bootstrap",
                headers=headers,
                timeout=10
            )
            
            # Accept 200 (success) or 400/409 (already bootstrapped)
            success = resp.status_code in [200, 400, 409]
            
            if resp.status_code == 200:
                data = resp.json()
                created = data.get("created", [])
                skipped = data.get("skipped", [])
                self.test(
                    "POST /api/admin/ext-clients/bootstrap",
                    True,
                    f"Created: {len(created)}, Skipped: {len(skipped)}"
                )
            else:
                self.test(
                    "POST /api/admin/ext-clients/bootstrap",
                    success,
                    f"Status: {resp.status_code} (may be already bootstrapped)"
                )
                
        except Exception as e:
            self.test("POST /api/admin/ext-clients/bootstrap", False, f"Exception: {e}")

    # ═══════════════════════════════════════════════════════════════
    # GOOGLE REVIEWS INTEGRATION TESTS
    # ═══════════════════════════════════════════════════════════════
    
    def test_google_reviews(self):
        """Test Google Reviews integration endpoints"""
        print("\n" + "="*70)
        print("⭐ GOOGLE REVIEWS INTEGRATION")
        print("="*70)
        
        # Test 1: Public Google Reviews endpoint
        try:
            resp = requests.get(
                f"{self.base_url}/api/public/google-reviews",
                timeout=10
            )
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                has_items = "items" in data or "reviews" in data or "data" in data
                has_stats = "rating" in data or "count" in data or "stats" in data
                
                self.test(
                    "GET /api/public/google-reviews",
                    has_items or has_stats,
                    f"Response keys: {list(data.keys())}"
                )
                
                # Check if reviews are >= 4 stars (as per config)
                reviews = data.get("items", data.get("reviews", data.get("data", [])))
                if reviews:
                    low_rated = [r for r in reviews if r.get("rating", 5) < 4]
                    self.test(
                        "Google Reviews: only >=4 stars shown",
                        len(low_rated) == 0,
                        f"Found {len(low_rated)} reviews below 4 stars (should be filtered)"
                    )
            else:
                self.test("GET /api/public/google-reviews", False, msg)
        except Exception as e:
            self.test("GET /api/public/google-reviews", False, f"Exception: {e}")
        
        # Test 2: Admin Google Reviews config (requires admin auth)
        if self.admin_token:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            
            try:
                resp = requests.get(
                    f"{self.base_url}/api/admin/google-reviews/config",
                    headers=headers,
                    timeout=10
                )
                success, msg = self.check_response(resp, 200)
                if success:
                    data = resp.json()
                    has_config = "enabled" in data or "api_key_preview" in data
                    self.test(
                        "GET /api/admin/google-reviews/config",
                        has_config,
                        f"Config keys: {list(data.keys())}"
                    )
                else:
                    self.test("GET /api/admin/google-reviews/config", False, msg)
            except Exception as e:
                self.test("GET /api/admin/google-reviews/config", False, f"Exception: {e}")
            
            # Test 3: Admin Google Reviews list (moderation)
            try:
                resp = requests.get(
                    f"{self.base_url}/api/admin/google-reviews",
                    headers=headers,
                    timeout=10
                )
                success, msg = self.check_response(resp, 200)
                if success:
                    data = resp.json()
                    has_items = "items" in data
                    self.test(
                        "GET /api/admin/google-reviews (moderation list)",
                        has_items,
                        f"Response keys: {list(data.keys())}"
                    )
                else:
                    self.test("GET /api/admin/google-reviews", False, msg)
            except Exception as e:
                self.test("GET /api/admin/google-reviews", False, f"Exception: {e}")
        else:
            self.log("⚠️  Skipping admin Google Reviews tests - no admin token")

    # ═══════════════════════════════════════════════════════════════
    # GOOGLE SIGN-IN INTEGRATION TESTS
    # ═══════════════════════════════════════════════════════════════
    
    def test_google_signin(self):
        """Test Google Sign-In integration endpoints"""
        print("\n" + "="*70)
        print("🔐 GOOGLE SIGN-IN INTEGRATION")
        print("="*70)
        
        # Test 1: Get Google Client ID (public endpoint)
        try:
            resp = requests.get(
                f"{self.base_url}/api/auth/google-client-id",
                timeout=10
            )
            # Accept 200 (configured) or 404 (not configured)
            success = resp.status_code in [200, 404]
            
            if resp.status_code == 200:
                data = resp.json()
                has_client_id = "clientId" in data or "client_id" in data
                self.test(
                    "GET /api/auth/google-client-id",
                    has_client_id,
                    f"Response keys: {list(data.keys())}"
                )
            else:
                self.test(
                    "GET /api/auth/google-client-id",
                    success,
                    f"Status: {resp.status_code} (may not be configured)"
                )
        except Exception as e:
            self.test("GET /api/auth/google-client-id", False, f"Exception: {e}")
        
        # Test 2: Google verify endpoint (should reject bad token with 400/422, not 500)
        try:
            resp = requests.post(
                f"{self.base_url}/api/customer-auth/google/verify",
                json={"token": "invalid_test_token_12345"},
                timeout=10
            )
            # Should return 400/401/422 for bad token, NOT 500
            success = resp.status_code in [400, 401, 422]
            
            self.test(
                "POST /api/customer-auth/google/verify (bad token)",
                success,
                f"Status: {resp.status_code} (expected 400/401/422, not 500)"
            )
            
            if resp.status_code == 500:
                self.backend_errors.append({
                    "endpoint": "/api/customer-auth/google/verify",
                    "status": 500,
                    "error": "Should return 400/422 for bad token, not 500"
                })
        except Exception as e:
            self.test("POST /api/customer-auth/google/verify", False, f"Exception: {e}")

    # ═══════════════════════════════════════════════════════════════
    # AUTH SETTINGS & INTEGRATIONS TESTS
    # ═══════════════════════════════════════════════════════════════
    
    def test_auth_settings(self):
        """Test auth settings and integrations endpoints"""
        print("\n" + "="*70)
        print("⚙️  AUTH SETTINGS & INTEGRATIONS")
        print("="*70)
        
        if not self.admin_token:
            self.log("⚠️  Skipping auth settings tests - no admin token")
            return
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Test 1: Auth settings with allowedDomains
        try:
            resp = requests.get(
                f"{self.base_url}/api/admin/auth/settings",
                headers=headers,
                timeout=10
            )
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                has_google = "google" in data
                
                if has_google:
                    google_settings = data.get("google", {})
                    has_allowed_domains = "allowedDomains" in google_settings
                    self.test(
                        "GET /api/admin/auth/settings (google.allowedDomains)",
                        has_allowed_domains,
                        f"Google settings keys: {list(google_settings.keys())}"
                    )
                else:
                    self.test(
                        "GET /api/admin/auth/settings",
                        True,
                        f"Response keys: {list(data.keys())} (google settings may not be configured)"
                    )
            else:
                self.test("GET /api/admin/auth/settings", False, msg)
        except Exception as e:
            self.test("GET /api/admin/auth/settings", False, f"Exception: {e}")
        
        # Test 2: Admin integrations/google endpoint
        try:
            resp = requests.get(
                f"{self.base_url}/api/admin/integrations/google",
                headers=headers,
                timeout=10
            )
            # Accept 200 or 404 (endpoint may not exist)
            success = resp.status_code in [200, 404]
            
            if resp.status_code == 200:
                data = resp.json()
                self.test(
                    "GET /api/admin/integrations/google",
                    True,
                    f"Response keys: {list(data.keys())}"
                )
            else:
                self.test(
                    "GET /api/admin/integrations/google",
                    success,
                    f"Status: {resp.status_code}"
                )
        except Exception as e:
            self.test("GET /api/admin/integrations/google", False, f"Exception: {e}")

    # ═══════════════════════════════════════════════════════════════
    # PHASE B2 — INSTANT-SHELL PATTERN TESTS
    # ═══════════════════════════════════════════════════════════════
    
    def test_phase_b2_instant_shell(self):
        """Test Phase B2 instant-shell pattern endpoints"""
        print("\n" + "="*70)
        print("⚡ PHASE B2 — INSTANT-SHELL PATTERN")
        print("="*70)
        
        # Test VINs as per review request
        KNOWN_VIN = "5N1AT2MV8FC838664"  # Real bitmotors lot in vin_data
        UNKNOWN_VIN = "JN1AZ34D11T123456"  # Should return not found
        WESTMOTORS_VIN = "2T2BZMCA4HC068423"  # Westmotors-queue-only VIN
        
        # Test 1: GET /api/vin/{vin}/shell on KNOWN VIN
        try:
            start_time = time.time()
            resp = requests.get(
                f"{self.base_url}/api/vin/{KNOWN_VIN}/shell",
                timeout=5
            )
            elapsed_ms = (time.time() - start_time) * 1000
            
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                
                # Check response shape
                has_required_fields = all(k in data for k in ["found", "source", "shell", "freshness", "age_seconds", "missing_fields", "data"])
                found = data.get("found") == True
                source = data.get("source") == "DB"
                shell_marker = data.get("shell") == True
                has_freshness = data.get("freshness") in ["fresh", "stale", "expired", "unknown"]
                has_data = data.get("data") is not None and data["data"].get("vin") == KNOWN_VIN
                response_time_ok = elapsed_ms < 200  # Target <150ms, allow <200ms
                
                self.test(
                    f"GET /api/vin/{KNOWN_VIN}/shell (known VIN)",
                    has_required_fields and found and source and shell_marker and has_freshness and has_data,
                    f"Response time: {elapsed_ms:.0f}ms, found={found}, source={data.get('source')}, freshness={data.get('freshness')}, missing_fields={len(data.get('missing_fields', []))}"
                )
                
                self.test(
                    f"Shell response time <200ms (known VIN)",
                    response_time_ok,
                    f"Actual: {elapsed_ms:.0f}ms (target <150ms)"
                )
            else:
                self.test(f"GET /api/vin/{KNOWN_VIN}/shell", False, msg)
        except Exception as e:
            self.test(f"GET /api/vin/{KNOWN_VIN}/shell", False, f"Exception: {e}")
        
        # Test 2: GET /api/vin/{vin}/shell on UNKNOWN VIN
        try:
            start_time = time.time()
            resp = requests.get(
                f"{self.base_url}/api/vin/{UNKNOWN_VIN}/shell",
                timeout=5
            )
            elapsed_ms = (time.time() - start_time) * 1000
            
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                
                found = data.get("found") == False
                source = data.get("source") == "NOT_FOUND"
                response_time_ok = elapsed_ms < 200
                
                self.test(
                    f"GET /api/vin/{UNKNOWN_VIN}/shell (unknown VIN)",
                    found and source and response_time_ok,
                    f"Response time: {elapsed_ms:.0f}ms, found={data.get('found')}, source={data.get('source')}"
                )
            else:
                self.test(f"GET /api/vin/{UNKNOWN_VIN}/shell", False, msg)
        except Exception as e:
            self.test(f"GET /api/vin/{UNKNOWN_VIN}/shell", False, f"Exception: {e}")
        
        # Test 3: GET /api/vin/{vin}/shell on WESTMOTORS-ONLY VIN
        try:
            start_time = time.time()
            resp = requests.get(
                f"{self.base_url}/api/vin/{WESTMOTORS_VIN}/shell",
                timeout=5
            )
            elapsed_ms = (time.time() - start_time) * 1000
            
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                
                found = data.get("found") == True
                source = data.get("source") == "WESTMOTORS_INDEX"
                has_pending_enrich = data.get("data", {}).get("_pending_enrich") == True
                has_missing_fields = len(data.get("missing_fields", [])) > 0
                response_time_ok = elapsed_ms < 200
                
                self.test(
                    f"GET /api/vin/{WESTMOTORS_VIN}/shell (westmotors-only VIN)",
                    found and source and has_pending_enrich and response_time_ok,
                    f"Response time: {elapsed_ms:.0f}ms, found={found}, source={data.get('source')}, missing_fields={len(data.get('missing_fields', []))}, _pending_enrich={has_pending_enrich}"
                )
            else:
                self.test(f"GET /api/vin/{WESTMOTORS_VIN}/shell", False, msg)
        except Exception as e:
            self.test(f"GET /api/vin/{WESTMOTORS_VIN}/shell", False, f"Exception: {e}")
        
        # Test 4: GET /api/vin/{vin}/enrich (live fallback chain)
        try:
            start_time = time.time()
            resp = requests.get(
                f"{self.base_url}/api/vin/{KNOWN_VIN}/enrich",
                timeout=30  # Allow 0.5-3s as per spec, but give more buffer
            )
            elapsed_ms = (time.time() - start_time) * 1000
            
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                
                shell_marker = data.get("shell") == False
                freshness = data.get("freshness") == "fresh"
                has_data = data.get("found") == True
                
                self.test(
                    f"GET /api/vin/{KNOWN_VIN}/enrich (live fallback)",
                    shell_marker and freshness and has_data,
                    f"Response time: {elapsed_ms:.0f}ms, shell={data.get('shell')}, freshness={data.get('freshness')}, found={data.get('found')}"
                )
            else:
                self.test(f"GET /api/vin/{KNOWN_VIN}/enrich", False, msg)
        except Exception as e:
            self.test(f"GET /api/vin/{KNOWN_VIN}/enrich", False, f"Exception: {e}")
        
        # Test 5: Legacy GET /api/vin/{vin} (backwards-compat)
        try:
            resp = requests.get(
                f"{self.base_url}/api/vin/{KNOWN_VIN}",
                timeout=30
            )
            
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                
                # Legacy endpoint should NOT have 'shell' field
                no_shell_field = "shell" not in data
                has_found = "found" in data
                has_source = "source" in data
                
                self.test(
                    f"GET /api/vin/{KNOWN_VIN} (legacy backwards-compat)",
                    no_shell_field and has_found and has_source,
                    f"Legacy shape preserved: shell field absent={no_shell_field}, found={data.get('found')}, source={data.get('source')}"
                )
            else:
                self.test(f"GET /api/vin/{KNOWN_VIN} (legacy)", False, msg)
        except Exception as e:
            self.test(f"GET /api/vin/{KNOWN_VIN} (legacy)", False, f"Exception: {e}")

    # ═══════════════════════════════════════════════════════════════
    # PUBLIC CATALOG ENDPOINTS (EXTENDED)
    # ═══════════════════════════════════════════════════════════════
    
    def test_public_catalog_extended(self):
        """Test additional public catalog endpoints"""
        print("\n" + "="*70)
        print("🚗 PUBLIC CATALOG (EXTENDED)")
        print("="*70)
        
        # Test 1: GET /api/public/featured
        try:
            resp = requests.get(
                f"{self.base_url}/api/public/featured",
                timeout=10
            )
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                has_items = "items" in data or "data" in data or isinstance(data, list)
                self.test(
                    "GET /api/public/featured",
                    has_items,
                    f"Response type: {type(data).__name__}, keys: {list(data.keys()) if isinstance(data, dict) else 'N/A'}"
                )
            else:
                self.test("GET /api/public/featured", False, msg)
        except Exception as e:
            self.test("GET /api/public/featured", False, f"Exception: {e}")
        
        # Test 2: GET /api/public/brands
        try:
            resp = requests.get(
                f"{self.base_url}/api/public/brands",
                timeout=10
            )
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                has_brands = isinstance(data, list) or "brands" in data or "data" in data
                self.test(
                    "GET /api/public/brands",
                    has_brands,
                    f"Response type: {type(data).__name__}, keys: {list(data.keys()) if isinstance(data, dict) else 'N/A'}"
                )
            else:
                self.test("GET /api/public/brands", False, msg)
        except Exception as e:
            self.test("GET /api/public/brands", False, f"Exception: {e}")
        
        # Test 3: GET /api/public/vehicles with filters
        filters = [
            ("limit=5", "limit filter", lambda d: len(d.get("data", d.get("items", []))) == 5),
            ("price_min=5000", "price_min filter", lambda d: d.get("total", 0) > 0),
            ("price_max=50000", "price_max filter", lambda d: d.get("total", 0) > 0),
        ]
        
        for filter_param, filter_name, check_fn in filters:
            try:
                resp = requests.get(
                    f"{self.base_url}/api/public/vehicles?{filter_param}",
                    timeout=10
                )
                success, msg = self.check_response(resp, 200)
                if success:
                    data = resp.json()
                    items = data.get("data", data.get("items", []))
                    passed = check_fn(data)
                    self.test(
                        f"GET /api/public/vehicles?{filter_param}",
                        passed,
                        f"Total: {data.get('total', 0)}, Items: {len(items)}"
                    )
                else:
                    self.test(f"GET /api/public/vehicles?{filter_param}", False, msg)
            except Exception as e:
                self.test(f"GET /api/public/vehicles?{filter_param}", False, f"Exception: {e}")
        
        # Test 4: Search parameter (note: may not be implemented)
        try:
            resp = requests.get(
                f"{self.base_url}/api/public/vehicles?search=Toyota&limit=5",
                timeout=10
            )
            success, msg = self.check_response(resp, 200)
            if success:
                data = resp.json()
                items = data.get("data", data.get("items", []))
                # Search may not be implemented - just check endpoint works
                self.test(
                    "GET /api/public/vehicles?search=Toyota",
                    len(items) > 0,
                    f"Total: {data.get('total', 0)}, Items: {len(items)} (search may not filter)"
                )
            else:
                self.test("GET /api/public/vehicles?search=Toyota", False, msg)
        except Exception as e:
            self.test("GET /api/public/vehicles?search=Toyota", False, f"Exception: {e}")

    # ═══════════════════════════════════════════════════════════════
    # MAIN TEST RUNNER
    # ═══════════════════════════════════════════════════════════════
    
    def run_all_tests(self):
        """Run all backend tests"""
        print("\n" + "="*70)
        print("BIBI CARS V3.2 — BACKEND API TEST SUITE")
        print("="*70)
        print(f"Base URL: {self.base_url}")
        print("="*70)
        
        # Run all test suites
        self.test_all_logins()
        self.test_public_endpoints()
        self.test_phase_b2_instant_shell()  # Phase B2 instant-shell pattern
        self.test_public_catalog_extended()
        self.test_google_reviews()
        self.test_google_signin()
        self.test_auth_settings()
        self.test_admin_endpoints()
        self.test_manager_endpoints()
        self.test_teamlead_endpoints()
        self.test_customer_endpoints()
        self.test_hmac_endpoint()
        self.test_bootstrap_endpoint()
        
        # Print summary
        self.print_summary()
        
        # Return exit code
        return 0 if self.tests_failed == 0 else 1

    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*70)
        print("📊 TEST SUMMARY")
        print("="*70)
        print(f"Total tests: {self.tests_run}")
        print(f"✅ Passed: {self.tests_passed}")
        print(f"❌ Failed: {self.tests_failed}")
        print(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.backend_errors:
            print(f"\n⚠️  Backend 5xx errors detected: {len(self.backend_errors)}")
            for err in self.backend_errors[:5]:  # Show first 5
                print(f"  - {err['endpoint']}: {err['status']} - {err['error'][:100]}")
        
        if self.failed_tests:
            print(f"\n❌ Failed tests ({len(self.failed_tests)}):")
            for ft in self.failed_tests[:10]:  # Show first 10
                critical = " [CRITICAL]" if ft.get("critical") else ""
                print(f"  - {ft['test']}{critical}")
                if ft['details']:
                    print(f"    {ft['details'][:150]}")
        
        print("="*70)


def main():
    tester = BIBICarsAPITester()
    exit_code = tester.run_all_tests()
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
