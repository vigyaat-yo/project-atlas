import unittest
import math
import numpy as np
from backend.route_engine import find_route, octile_heuristic, SQRT2


class TestRouteEngine(unittest.TestCase):

    def test_octile_heuristic(self):
        self.assertEqual(octile_heuristic((0, 0), (0, 0)), 0.0)
        self.assertEqual(octile_heuristic((0, 0), (0, 5)), 5.0)
        self.assertAlmostEqual(octile_heuristic((0, 0), (5, 5)), 5.0 * SQRT2, places=5)
        expected = (SQRT2 - 1.0) * 3 + 7
        self.assertAlmostEqual(octile_heuristic((0, 0), (7, 3)), expected, places=5)

    def test_direct_8_way_diagonal(self):
        # 10x10 walkable grid with 0 risk
        grid = np.ones((10, 10), dtype=bool)
        risk = np.zeros((10, 10), dtype=float)

        start = (0, 0)
        goal = (5, 5)

        route = find_route(grid, risk, start, goal, risk_weight=0.0)

        # In an 8-way grid, (0,0) to (5,5) should be a straight diagonal of 6 points
        self.assertEqual(len(route), 6)
        for i in range(6):
            self.assertEqual(route[i], (i, i))

    def test_corner_cutting_prevention(self):
        # Create a 4x4 grid with a diagonal obstacle that touches corners:
        # (1, 2) is blocked, (2, 1) is blocked.
        # Diagonal move from (1, 1) to (2, 2) must NOT cut through the diagonal barrier!
        grid = np.ones((4, 4), dtype=bool)
        grid[1, 2] = False
        grid[2, 1] = False
        risk = np.zeros((4, 4), dtype=float)

        start = (1, 1)
        goal = (2, 2)

        route = find_route(grid, risk, start, goal, risk_weight=0.0)

        self.assertIn((1, 1), route)
        self.assertIn((2, 2), route)
        # Verify no illegal diagonal transition across blocked corner:
        for i in range(len(route) - 1):
            if route[i] == (1, 1):
                self.assertNotEqual(route[i + 1], (2, 2), "Route illegally cut across diagonal obstacle corner!")

    def test_risk_avoidance_detour(self):
        # 7x7 grid with a high-risk zone right in the middle
        grid = np.ones((7, 7), dtype=bool)
        risk = np.zeros((7, 7), dtype=float)

        # Place high risk in middle row (row 3, cols 1..5)
        risk[3, 1:6] = 45.0

        start = (1, 3)
        goal = (5, 3)

        # With risk_weight = 0 (pure shortest path), it goes straight through row 3
        route_direct = find_route(grid, risk, start, goal, risk_weight=0.0)
        self.assertTrue(any(r == 3 for r, c in route_direct))

        # With risk_weight = 3.0 (risk-averse), it detours around the risk block
        route_safe = find_route(grid, risk, start, goal, risk_weight=3.0)
        safe_risk_sum = sum(risk[r, c] for r, c in route_safe)
        direct_risk_sum = sum(risk[r, c] for r, c in route_direct)
        self.assertLess(safe_risk_sum, direct_risk_sum)

    def test_unreachable_goal(self):
        # Grid where goal is surrounded by blocked cells
        grid = np.ones((5, 5), dtype=bool)
        grid[1, :] = False  # Horizontal wall blocking rows 2..4
        risk = np.zeros((5, 5), dtype=float)

        start = (0, 0)
        goal = (3, 3)

        route = find_route(grid, risk, start, goal)
        self.assertEqual(route, [])


if __name__ == '__main__':
    unittest.main()
