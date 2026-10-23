from app.main import app


def main() -> None:
    schema = app.openapi()
    paths = schema["paths"]

    assert "/running/places/search" in paths
    assert "/running/routes/preview" in paths
    assert "/running/routes/generate-loop" in paths
    assert "/running/session/recommend" in paths
    assert "/running/courses/recommend" in paths
    assert "/running/courses/{course_id}" in paths
    assert "get" in paths["/running/places/search"]
    assert "post" in paths["/running/routes/preview"]
    assert "post" in paths["/running/routes/generate-loop"]
    assert "post" in paths["/running/session/recommend"]
    assert "get" in paths["/running/courses/recommend"]
    assert "get" in paths["/running/courses/{course_id}"]

    recommendation_query_names = {
        parameter["name"]
        for parameter in paths["/running/courses/recommend"]["get"][
            "parameters"
        ]
    }
    assert "distance_option" in recommendation_query_names
    assert "desired_difficulty" in recommendation_query_names

    components = schema["components"]["schemas"]
    recommendation_properties = components[
        "RunningCourseRecommendationResponse"
    ]["properties"]
    course_properties = components[
        "RunningCourseSummary"
    ]["properties"]
    source_properties = components[
        "RunningCourseSource"
    ]["properties"]

    assert "data_sources" in recommendation_properties
    assert "geometry_distance_km" in course_properties
    assert "source_course_id" in source_properties
    assert "RunningLoopGenerationRequest" in components
    assert "RunningLoopGenerationResponse" in components
    assert "GeneratedRunningLoop" in components
    assert "RunningSessionRecommendationRequest" in components
    assert "RunningSessionRecommendationResponse" in components

    print("running OpenAPI contract: OK")


def test_running_openapi_contract() -> None:
    main()


if __name__ == "__main__":
    main()
