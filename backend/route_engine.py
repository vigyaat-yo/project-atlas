import heapq
import math
from typing import List, Tuple, Optional, Dict
import numpy as np


SQRT2 = math.sqrt(2.0)


def octile_heuristic(a: Tuple[int, int], b: Tuple[int, int]) -> float:
    """
    Admissible Octile distance heuristic for 8-connected 2D grid.
    dx = |r1 - r2|, dy = |c1 - c2|
    h = (sqrt(2) - 1) * min(dx, dy) + max(dx, dy)
    """
    dx = abs(a[0] - b[0])
    dy = abs(a[1] - b[1])
    return (SQRT2 - 1.0) * min(dx, dy) + max(dx, dy)


def euclidean_heuristic(a: Tuple[int, int], b: Tuple[int, int]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def find_route(
    grid: np.ndarray,
    risk: np.ndarray,
    start: Tuple[int, int],
    goal: Tuple[int, int],
    risk_weight: float = 1.0,
    elevation: Optional[np.ndarray] = None,
    elev_weight: float = 0.0,
) -> List[Tuple[int, int]]:
    """
    Finds optimal 8-directional route using A* pathfinding.

    Parameters:
    - grid: 2D boolean array where True = walkable, False = impassable hazard
    - risk: 2D float array containing terrain risk / obstacle roughness scores (0-100)
    - start: (row, col) start coordinates
    - goal: (row, col) goal coordinates
    - risk_weight: multiplier for risk penalty (0.0 = pure shortest distance, 1.0+ = risk-averse)
    - elevation: optional 2D float array of terrain elevation in meters
    - elev_weight: penalty factor for climbing steep elevation deltas

    Features:
    - 8-directional movement (orthogonal step = 1.0, diagonal step = sqrt(2))
    - Strict corner-cutting prevention: cannot cross diagonally if adjacent orthogonal cells are blocked
    - Admissible Octile heuristic guaranteeing optimality for the chosen cost function
    """
    rows, cols = grid.shape

    # Boundary check
    if not (0 <= start[0] < rows and 0 <= start[1] < cols):
        return []
    if not (0 <= goal[0] < rows and 0 <= goal[1] < cols):
        return []
    if not grid[start[0], start[1]] or not grid[goal[0], goal[1]]:
        return []

    if start == goal:
        return [start]

    # Directions: (dr, dc, base_dist)
    # Orthogonal
    ortho_dirs = [(1, 0, 1.0), (-1, 0, 1.0), (0, 1, 1.0), (0, -1, 1.0)]
    # Diagonal
    diag_dirs = [(1, 1, SQRT2), (1, -1, SQRT2), (-1, 1, SQRT2), (-1, -1, SQRT2)]
    all_dirs = ortho_dirs + diag_dirs

    queue: List[Tuple[float, Tuple[int, int]]] = [(0.0, start)]
    came_from: Dict[Tuple[int, int], Tuple[int, int]] = {}
    cost_so_far: Dict[Tuple[int, int], float] = {start: 0.0}

    while queue:
        _, current = heapq.heappop(queue)

        if current == goal:
            break

        cr, cc = current
        current_cost = cost_so_far[current]

        for dr, dc, step_dist in all_dirs:
            nr, nc = cr + dr, cc + dc

            # Bounds & walkability check
            if nr < 0 or nr >= rows or nc < 0 or nc >= cols:
                continue
            if not grid[nr, nc]:
                continue

            # Corner-cutting check for diagonal moves:
            # If moving diagonally, both orthogonal adjacent cells must be walkable
            # so the rover does not clip through the corner of an obstacle.
            if dr != 0 and dc != 0:
                if not grid[cr + dr, cc] or not grid[cr, cc + dc]:
                    continue

            # Base distance cost + terrain risk penalty
            r_val = float(risk[nr, nc]) if risk is not None else 0.0
            step_cost = step_dist * (1.0 + risk_weight * (r_val / 25.0))

            # Optional elevation climbing cost
            if elevation is not None and elev_weight > 0.0:
                elev_diff = float(elevation[nr, nc] - elevation[cr, cc])
                if elev_diff > 0:
                    step_cost += elev_weight * (elev_diff / 50.0) * step_dist

            new_cost = current_cost + step_cost

            if nr == goal[0] and nc == goal[1]:
                # Reached goal
                if (nr, nc) not in cost_so_far or new_cost < cost_so_far[(nr, nc)]:
                    cost_so_far[(nr, nc)] = new_cost
                    came_from[(nr, nc)] = current
                    break

            if (nr, nc) not in cost_so_far or new_cost < cost_so_far[(nr, nc)]:
                cost_so_far[(nr, nc)] = new_cost
                priority = new_cost + octile_heuristic((nr, nc), goal)
                heapq.heappush(queue, (priority, (nr, nc)))
                came_from[(nr, nc)] = current

    if goal not in came_from:
        return []

    # Reconstruct route
    route = []
    curr = goal
    while curr != start:
        route.append(curr)
        curr = came_from[curr]
    route.append(start)
    route.reverse()

    return route