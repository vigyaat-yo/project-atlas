import heapq


def heuristic(a, b):
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


def find_route(grid, risk, start, goal):
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