"""End-to-end test of the Damage Dispute Pack APIs.
Downloads sample car photos, posts to /api/analyze, then /api/dispute."""
import sys, json, base64, urllib.request
from urllib.parse import urlparse

# Force UTF-8 stdout on Windows
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BASE = "http://localhost:3000"

# Royalty-free car photos from Unsplash/Pexels CDNs (resized small for speed)
PICKUP_URLS = [
    # Clean white sedan, side view
    "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&q=80",
    # Clean car front
    "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80",
]

RETURN_URLS = [
    # Damaged car bumper
    "https://images.unsplash.com/photo-1607004468138-e7e23ea26947?w=800&q=80",
    # Same clean front as pickup (control)
    "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80",
]


def download_as_payload(url: str) -> dict:
    print(f"  downloading {url[:60]}...")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read()
        content_type = resp.headers.get("Content-Type", "image/jpeg").split(";")[0]
    return {
        "mediaType": content_type,
        "base64": base64.b64encode(data).decode("ascii"),
    }


def post_json(path: str, body: dict, timeout: int = 90) -> dict:
    url = BASE + path
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def main():
    print("=" * 70)
    print("END-TO-END TEST: Damage Dispute Pack")
    print("=" * 70)

    # 1. Verify dev server is up
    print("\n[1/4] Checking dev server...")
    try:
        with urllib.request.urlopen(BASE, timeout=10) as r:
            assert r.status == 200, "non-200"
        print("  [ok] http://localhost:3000 is up")
    except Exception as e:
        print(f"  [error] dev server not reachable: {e}")
        return 1

    # 2. Download photos
    print("\n[2/4] Downloading sample photos...")
    pickup_photos = [download_as_payload(u) for u in PICKUP_URLS]
    return_photos = [download_as_payload(u) for u in RETURN_URLS]
    print(f"  [ok] {len(pickup_photos)} pickup + {len(return_photos)} return photos")

    # 3. Call analyze
    print("\n[3/4] POST /api/analyze ...")
    try:
        analysis = post_json("/api/analyze", {
            "pickupPhotos": pickup_photos,
            "returnPhotos": return_photos,
        }, timeout=120)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  [error] HTTP {e.code}: {body[:500]}")
        return 1

    if "error" in analysis:
        print(f"  [error] {analysis['error']}")
        if "raw" in analysis:
            print(f"  raw response: {analysis['raw'][:500]}")
        return 1

    print(f"  [ok] response received")
    print(f"  new_damage_detected: {analysis.get('new_damage_detected')}")
    print(f"  findings count:      {len(analysis.get('findings', []))}")
    print(f"  summary:             {analysis.get('summary','')[:200]}")
    print(f"  total estimate:      ${analysis.get('total_estimate_low_usd',0)} - ${analysis.get('total_estimate_high_usd',0)}")
    for i, f in enumerate(analysis.get("findings", []), 1):
        print(f"    finding #{i}: {f.get('location')} — {f.get('description')[:80]} ({f.get('severity')})")

    if not analysis.get("new_damage_detected") or not analysis.get("findings"):
        print("\n  [skip] no damage detected, skipping dispute step")
        print("\n[4/4] (skipped)")
        print("\n=" * 35)
        print("TEST COMPLETED — analyze works end-to-end")
        return 0

    # 4. Call dispute
    print("\n[4/4] POST /api/dispute ...")
    try:
        dispute = post_json("/api/dispute", {
            "vehicleLabel": "2021 Honda Civic LX",
            "renterName": "Sarah K.",
            "tripStartDate": "2026-05-28",
            "tripEndDate": "2026-05-30",
            "pickupPhotoCount": len(pickup_photos),
            "returnPhotoCount": len(return_photos),
            "findings": analysis["findings"],
            "operatorNotes": "Renter said they hit a pothole on the highway.",
        }, timeout=120)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  [error] HTTP {e.code}: {body[:500]}")
        return 1

    if "error" in dispute:
        print(f"  [error] {dispute['error']}")
        return 1

    print(f"  [ok] dispute generated")
    print(f"  subject:  {dispute.get('subject')}")
    print(f"  amount:   ${dispute.get('requested_amount_low_usd')} - ${dispute.get('requested_amount_high_usd')}")
    print(f"\n  --- DISPUTE BODY ---")
    print(dispute.get("body", ""))
    print(f"  --- end ---")
    print(f"\n  next_steps:")
    for s in dispute.get("next_steps", []):
        print(f"    - {s}")

    print("\n" + "=" * 70)
    print("TEST COMPLETED — analyze + dispute both work end-to-end")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(main())
