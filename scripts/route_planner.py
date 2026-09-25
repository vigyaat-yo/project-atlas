import heapq
import numpy as np
import matplotlib.pyplot as plt


def heuristic(a, b):
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


def find_route(grid, start, goal):
    queue = [(0, start)]
    came_from = {}
    cost_so_far = {start: 0}

    while queue:
        _, current = heapq.heappop(queue)

        if current == goal:
            break

        row, col = current

        for dr, dc in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
            nr, nc = row + dr, col + dc

            if (
                nr < 0
                or nr >= grid.shape[0]
                or nc < 0
                or nc >= grid.shape[1]
                or not grid[nr, nc]
            ):
                continue

            neighbor = (nr, nc)
            new_cost = cost_so_far[current] + 1 + (risk[nr, nc] / 100)

            if neighbor not in cost_so_far or new_cost < cost_so_far[neighbor]:
                cost_so_far[neighbor] = new_cost
                priority = new_cost + heuristic(neighbor, goal)
                heapq.heappush(queue, (priority, neighbor))
                came_from[neighbor] = current

    if goal not in came_from:
        return []

    route = []
    current = goal

    while current != start:
        route.append(current)
        current = came_from[current]

    route.append(start)
    route.reverse()

    return route


terrain = np.load("data/processed/jezero_terrain.npz")
risk = terrain["risk"]

walkable = risk < 50

start = (250, 250)
goal = (300, 300)

route = find_route(walkable, start, goal)

print("ROUTE FOUND:", len(route), "cells")
print("START:", start)
print("GOAL:", goal)

plt.figure(figsize=(8, 8))
plt.imshow(risk, cmap="inferno")
route_rows = [p[0] for p in route]
route_cols = [p[1] for p in route]
plt.plot(route_cols, route_rows)
plt.scatter(start[1], start[0], s=80, marker="o")
plt.scatter(goal[1], goal[0], s=80, marker="x")
plt.title("MARSWAY A* Route")
plt.axis("off")
plt.savefig("data/processed/astar_route_preview.png", dpi=150, bbox_inches="tight")

print("ROUTE PREVIEW SAVED")

if route:
    route_risks = [risk[row, col] for row, col in route]

    print("ROUTE MEAN RISK:", round(float(np.mean(route_risks)), 2))
    print("ROUTE MAX RISK:", round(float(np.max(route_risks)), 2))