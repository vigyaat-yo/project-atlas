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

    def test_explain_route_endpoint(self):
        # First get a small route
        payload = {
            "start_lat": 18.4447,
            "start_lon": 77.4508,
            "goal_lat": 18.4500,
            "goal_lon": 77.4400,
            "risk_weight": 1.5,
            "max_risk": 50.0,
            "compare": True,
        }
        route_res = client.post("/route", json=payload)
        self.assertEqual(route_res.status_code, 200)
        route_data = route_res.json()

        explain_req = {
            "route": route_data["route"],
            "start_coords": route_data["start_coords"],
            "goal_coords": route_data["goal_coords"],
            "risk_weight": route_data["risk_weight"],
            "max_risk": 50.0,
            "comparison": route_data.get("comparison"),
        }
        res = client.post("/explain-route", json=explain_req)
        self.assertEqual(res.status_code, 200)
        exp = res.json()
        self.assertIn("executive_summary", exp)
        self.assertIn("route_rationale", exp)
        self.assertIn("hazard_breakdown", exp)
        self.assertIn("tactical_recommendations", exp)
        self.assertIn("limitations_and_uncertainties", exp)
        # Verify resolution limitation is mentioned
        self.assertTrue(
            "463" in exp["limitations_and_uncertainties"]
            or "MOLA" in exp["limitations_and_uncertainties"]
            or "HazCam" in exp["limitations_and_uncertainties"]
        )
        self.assertIsNotNone(exp["metrics"])
        self.assertGreater(exp["metrics"]["approx_distance_km"], 0)

    def test_missions_crud_lifecycle(self):
        # 1. Create a mission
        mission_payload = {
            "title": "Perseverance to Three Forks Sample Depot",
            "start_lat": 18.4447,
            "start_lon": 77.4508,
            "goal_lat": 18.4700,
            "goal_lon": 77.4200,
            "risk_weight": 1.5,
            "max_risk": 50.0,
            "elev_weight": 0.0,
            "distance_km": 4.12,
            "waypoints_count": 12,
            "mean_risk": 14.2,
            "max_risk_val": 28.5,
            "risk_reduction_pct": 34.2,
            "distance_delta_km": 0.85,
            "waypoints": [[256, 257], [255, 256], [254, 255]],
            "operator_notes": "Sample caching validation drive",
        }
        create_res = client.post("/missions", json=mission_payload)
        self.assertEqual(create_res.status_code, 200)
        saved = create_res.json()
        self.assertIn("id", saved)
        mission_id = saved["id"]
        self.assertEqual(saved["title"], "Perseverance to Three Forks Sample Depot")

        # 2. List missions
        list_res = client.get("/missions")
        self.assertEqual(list_res.status_code, 200)
        missions = list_res.json()
        self.assertIsInstance(missions, list)
        self.assertTrue(any(m["id"] == mission_id for m in missions))

        # 3. Read specific mission
        get_res = client.get(f"/missions/{mission_id}")
        self.assertEqual(get_res.status_code, 200)
        retrieved = get_res.json()
        self.assertEqual(retrieved["id"], mission_id)
        self.assertEqual(len(retrieved["waypoints"]), 3)

        # 4. Delete mission
        del_res = client.delete(f"/missions/{mission_id}")
        self.assertEqual(del_res.status_code, 200)
        self.assertTrue(del_res.json()["deleted"])

        # 5. Confirm deletion returns 404
        get_after_del = client.get(f"/missions/{mission_id}")
        self.assertEqual(get_after_del.status_code, 404)


if __name__ == "__main__":
    unittest.main()

