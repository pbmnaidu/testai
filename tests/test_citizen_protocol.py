import unittest
from types import SimpleNamespace

from fastapi import HTTPException

import src.backend.app as citizen_app


class CitizenProtocolTests(unittest.TestCase):
    def test_haversine_zero_distance(self):
        self.assertEqual(
            citizen_app._haversine_distance_meters(17.687629, 83.01491, 17.687629, 83.01491),
            0.0,
        )

    def test_location_validation_distinguishes_radius_and_accuracy(self):
        work = {"latitude": 17.687629, "longitude": 83.01491}

        within, within_distance = citizen_app._record_location_status(17.6880, 83.01491, 10, work)
        outside, outside_distance = citizen_app._record_location_status(17.6970, 83.01491, 10, work)
        low_accuracy, low_accuracy_distance = citizen_app._record_location_status(17.687629, 83.01491, 100, work)

        self.assertEqual(within, "WITHIN_EXPECTED_RADIUS")
        self.assertIsNotNone(within_distance)
        self.assertEqual(outside, "OUTSIDE_EXPECTED_RADIUS")
        self.assertIsNotNone(outside_distance)
        self.assertEqual(low_accuracy, "LOW_GPS_ACCURACY")
        self.assertIsNone(low_accuracy_distance)

    def test_image_signature_validation_accepts_supported_formats_only(self):
        self.assertEqual(citizen_app._detect_image_type(b"\xff\xd8\xffpayload"), "jpg")
        self.assertEqual(citizen_app._detect_image_type(b"\x89PNG\r\n\x1a\npayload"), "png")
        self.assertEqual(citizen_app._detect_image_type(b"RIFF1234WEBPpayload"), "webp")
        self.assertIsNone(citizen_app._detect_image_type(b"not-an-image"))

    def test_review_auth_fails_closed_without_configured_authorization(self):
        original_token = citizen_app.CITIZEN_REVIEW_TOKEN
        original_local_flag = citizen_app.CITIZEN_ALLOW_LOCAL_OFFICER_REVIEW
        try:
            citizen_app.CITIZEN_REVIEW_TOKEN = ""
            citizen_app.CITIZEN_ALLOW_LOCAL_OFFICER_REVIEW = False
            with self.assertRaises(HTTPException) as no_headers:
                citizen_app._require_citizen_officer(SimpleNamespace(headers={}))
            with self.assertRaises(HTTPException) as role_header:
                citizen_app._require_citizen_officer(SimpleNamespace(headers={"x-mplads-role": "officer"}))
            self.assertEqual(no_headers.exception.status_code, 403)
            self.assertEqual(role_header.exception.status_code, 403)
        finally:
            citizen_app.CITIZEN_REVIEW_TOKEN = original_token
            citizen_app.CITIZEN_ALLOW_LOCAL_OFFICER_REVIEW = original_local_flag

    def test_review_auth_accepts_configured_bearer_token_or_explicit_local_opt_in(self):
        original_token = citizen_app.CITIZEN_REVIEW_TOKEN
        original_local_flag = citizen_app.CITIZEN_ALLOW_LOCAL_OFFICER_REVIEW
        try:
            citizen_app.CITIZEN_REVIEW_TOKEN = "test-token"
            citizen_app.CITIZEN_ALLOW_LOCAL_OFFICER_REVIEW = False
            self.assertEqual(
                citizen_app._require_citizen_officer(
                    SimpleNamespace(headers={"authorization": "Bearer test-token"})
                ),
                "configured_officer",
            )

            citizen_app.CITIZEN_REVIEW_TOKEN = ""
            citizen_app.CITIZEN_ALLOW_LOCAL_OFFICER_REVIEW = True
            self.assertEqual(
                citizen_app._require_citizen_officer(SimpleNamespace(headers={"x-mplads-role": "officer"})),
                "local_officer",
            )
        finally:
            citizen_app.CITIZEN_REVIEW_TOKEN = original_token
            citizen_app.CITIZEN_ALLOW_LOCAL_OFFICER_REVIEW = original_local_flag


if __name__ == "__main__":
    unittest.main()
