import unittest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


class TestMarswayAPI(unittest.TestCase):

    def test_health_endpoint(self):
        res = client.get("/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["version"], "2.0.0")
        self.assertTrue(data["grid_loaded"])
        self.assertEqual(data["grid_shape"], [513, 513])

    def test_terrain_endpoint(self):
        res = client.get("/terrain")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["name"], "Jezero Crater")
        self.assertEqual(data["width"], 513)
        self.assertEqual(data["height"], 513)
        self.assertLess(data["elevation_min"], data["elevation_max"])
        self.assertGreater(data["slope_max"], 10.0)

    def test_science_targets_endpoint(self):
        res = client.get("/science-targets")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIsInstance(data, list)
        self.assertEqual(len(data), 6)
        names = [t["name"] for t in data]
        self.assertIn("Midway (Delta Front)", names)
        self.assertIn("Three Forks Delta Contact", names)

    def test_perseverance_landmarks_endpoint(self):
        res = client.get("/perseverance-landmarks")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIsInstance(data, list)
        self.assertEqual(len(data), 3)
        names = [l["name"] for l in data]
        self.assertTrue(any("Octavia E. Butler" in n for n in names))
        self.assertTrue(any("Ingenuity" in n for n in names))

    def test_route_get_valid(self):
        params = {
            "start_lat": 18.4447,
            "start_lon": 77.4508,
            "goal_lat": 18.4500,
            "goal_lon": 77.4400,
            "risk_weight": 1.5,
            "compare": True,
        }
        res = client.get("/route", params=params)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("route", data)
        self.assertGreater(data["route_length"], 0)
        self.assertGreater(data["approx_distance_km"], 0)
        self.assertLess(data["max_risk"], 50.0)
        self.assertIsNotNone(data["comparison"])
        self.assertIn("direct_route", data["comparison"])

    def test_route_out_of_bounds_returns_400(self):
        params = {
            "start_lat": 0.0,
            "start_lon": 0.0,
            "goal_lat": 18.45,
            "goal_lon": 77.44,
        }
        res = client.get("/route", params=params)
        self.assertEqual(res.status_code, 400)
        data = res.json()
        self.assertIn("outside the Jezero terrain grid", data["detail"])

    def test_route_post_valid_json(self):
        payload = {
            "start_lat": 18.4447,
            "start_lon": 77.4508,
            "goal_lat": 18.4500,
            "goal_lon": 77.4400,
            "risk_weight": 2.0,
            "max_risk": 50.0,
            "compare": True,
        }
        res = client.post("/route", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("route", data)
        self.assertEqual(data["risk_weight"], 2.0)



if __name__ == "__main__":
    unittest.main()
