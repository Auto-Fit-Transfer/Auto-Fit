from __future__ import annotations

from typing import Any

import httpx

from app.core.config import get_settings
from app.schemas.running import (
    GeoCoordinate,
    RunningPlace,
)
from app.utils.coordinates import (
    coordinate_to_kakao_xy,
    kakao_xy_to_coordinate,
)


KAKAO_LOCAL_BASE_URL = "https://dapi.kakao.com"


class KakaoMapConfigurationError(RuntimeError):
    """Raised when Kakao Maps credentials are unavailable."""


class KakaoMapProviderError(RuntimeError):
    """Raised when Kakao Maps rejects or cannot process a request."""


class KakaoMapService:
    def __init__(
        self,
        api_key: str | None = None,
        timeout_seconds: float | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        settings = get_settings()
        self.api_key = (
            api_key
            if api_key is not None
            else settings.kakao_rest_api_key
        )
        self.timeout_seconds = (
            timeout_seconds
            if timeout_seconds is not None
            else settings.kakao_api_timeout_seconds
        )
        self._client = client
        self._owns_client = client is None

    async def __aenter__(self) -> "KakaoMapService":
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=KAKAO_LOCAL_BASE_URL,
                timeout=self.timeout_seconds,
            )

        return self

    async def __aexit__(
        self,
        exc_type: object,
        exc: object,
        traceback: object,
    ) -> None:
        if self._owns_client and self._client is not None:
            await self._client.aclose()
            self._client = None

    def _headers(self) -> dict[str, str]:
        if not self.api_key or not self.api_key.strip():
            raise KakaoMapConfigurationError(
                "KAKAO_REST_API_KEY is not configured."
            )

        return {
            "Authorization": f"KakaoAK {self.api_key.strip()}"
        }

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            raise RuntimeError(
                "KakaoMapService must be used as an async context manager."
            )

        return self._client

    async def search_places(
        self,
        query: str,
        center: GeoCoordinate | None = None,
        radius_m: int | None = None,
        size: int = 15,
    ) -> list[RunningPlace]:
        params: dict[str, str | int | float] = {
            "query": query,
            "size": size,
        }

        if center is not None:
            longitude, latitude = coordinate_to_kakao_xy(
                center
            )
            params.update(
                {
                    "x": longitude,
                    "y": latitude,
                    "sort": "distance",
                }
            )

            if radius_m is not None:
                params["radius"] = radius_m

        payload = await self._request_json(
            "/v2/local/search/keyword.json",
            params=params,
        )

        return [
            RunningPlace(
                place_name=str(item.get("place_name") or ""),
                address_name=(item.get("address_name") or None),
                road_address_name=(
                    item.get("road_address_name") or None
                ),
                coordinate=kakao_xy_to_coordinate(
                    item["x"],
                    item["y"],
                ),
                distance_m=(
                    int(item["distance"])
                    if item.get("distance") not in (None, "")
                    else None
                ),
            )
            for item in payload.get("documents", [])
            if item.get("x") and item.get("y")
        ]

    async def geocode_address(
        self,
        address: str,
    ) -> GeoCoordinate | None:
        payload = await self._request_json(
            "/v2/local/search/address.json",
            params={"query": address},
        )

        for item in payload.get("documents", []):
            if item.get("x") and item.get("y"):
                return kakao_xy_to_coordinate(
                    item["x"],
                    item["y"],
                )

        return None

    async def resolve_region_name(
        self,
        coordinate: GeoCoordinate,
    ) -> str | None:
        longitude, latitude = coordinate_to_kakao_xy(coordinate)
        payload = await self._request_json(
            "/v2/local/geo/coord2regioncode.json",
            params={
                "x": longitude,
                "y": latitude,
                "input_coord": "WGS84",
            },
        )
        documents = payload.get("documents", [])
        administrative = next(
            (
                item
                for item in documents
                if item.get("region_type") == "H"
            ),
            None,
        )
        selected = administrative or (
            documents[0] if documents else None
        )

        if not isinstance(selected, dict):
            return None

        return (
            selected.get("region_2depth_name")
            or selected.get("region_1depth_name")
            or selected.get("address_name")
            or None
        )

    async def get_walking_route(
        self,
        start: GeoCoordinate,
        end: GeoCoordinate,
        waypoints: list[GeoCoordinate] | None = None,
    ) -> dict[str, Any]:
        waypoints = waypoints or []
        start_x, start_y = coordinate_to_kakao_xy(start)
        end_x, end_y = coordinate_to_kakao_xy(end)

        params: dict[str, str | float] = {
            "start_x": start_x,
            "start_y": start_y,
            "end_x": end_x,
            "end_y": end_y,
            "input_coord": "WGS84",
            "output_coord": "WGS84",
        }

        if waypoints:
            waypoint_pairs = [
                coordinate_to_kakao_xy(point)
                for point in waypoints
            ]
            params["via_x"] = ",".join(
                str(pair[0]) for pair in waypoint_pairs
            )
            params["via_y"] = ",".join(
                str(pair[1]) for pair in waypoint_pairs
            )

        payload = await self._request_json(
            "/v2/routing/walk",
            params=params,
        )

        return self.parse_walking_route_payload(payload)

    @staticmethod
    def parse_walking_route_payload(
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if payload.get("status") != "OK":
            raise KakaoMapProviderError(
                "Kakao walking route returned an unsuccessful status."
            )

        route = payload.get("route") or {}
        properties = route.get("properties") or {}
        total_distance_m = properties.get("totalDistance")

        if not isinstance(total_distance_m, (int, float)):
            raise KakaoMapProviderError(
                "Kakao walking route did not include a distance."
            )

        path: list[GeoCoordinate] = []

        for leg in route.get("legs") or []:
            for step in leg.get("steps") or []:
                points = (step.get("path") or {}).get("points") or []

                for point in points:
                    if not isinstance(point, list) or len(point) < 2:
                        continue

                    coordinate = kakao_xy_to_coordinate(
                        point[0],
                        point[1],
                    )

                    if not path or path[-1] != coordinate:
                        path.append(coordinate)

        if len(path) < 2:
            raise KakaoMapProviderError(
                "Kakao walking route did not include usable geometry."
            )

        return {
            "distance_m": float(total_distance_m),
            "duration_seconds": properties.get("totalTime"),
            "path": path,
        }

    async def _request_json(
        self,
        path: str,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        try:
            response = await self._get_client().get(
                path,
                params=params,
                headers=self._headers(),
            )
            response.raise_for_status()
        except httpx.TimeoutException as exc:
            raise KakaoMapProviderError(
                "Kakao Maps request timed out."
            ) from exc
        except httpx.HTTPStatusError as exc:
            raise KakaoMapProviderError(
                "Kakao Maps rejected the request "
                f"with HTTP {exc.response.status_code}."
            ) from exc
        except httpx.HTTPError as exc:
            raise KakaoMapProviderError(
                "Kakao Maps request failed."
            ) from exc

        try:
            payload = response.json()
        except ValueError as exc:
            raise KakaoMapProviderError(
                "Kakao Maps returned a non-JSON response."
            ) from exc

        if not isinstance(payload, dict):
            raise KakaoMapProviderError(
                "Kakao Maps returned an invalid response."
            )

        return payload
