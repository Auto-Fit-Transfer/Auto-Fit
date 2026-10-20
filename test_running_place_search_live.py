import asyncio

from app.schemas.running import GeoCoordinate
from app.services.kakao_map_service import KakaoMapService


async def main() -> None:
    async with KakaoMapService() as service:
        places = await service.search_places(
            query="판교역",
            center=GeoCoordinate(
                latitude=37.3948,
                longitude=127.1112,
            ),
            radius_m=5000,
        )

    assert places
    assert all(place.coordinate for place in places)
    print(
        "Kakao place search live test: OK "
        f"(places={len(places)}, first={places[0].place_name})"
    )


if __name__ == "__main__":
    asyncio.run(main())
