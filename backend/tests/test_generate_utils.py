from app.routers.generate import _process_node_paths


def test_process_node_paths_builds_blob_and_tree_links():
    graph_data = {
        "nodes": [
            {"id": "api", "label": "API", "type": "service", "path": "src/api.ts"},
            {"id": "core", "label": "Core", "type": "service", "path": "src/core"},
        ],
        "edges": [],
        "groups": [],
    }
    output = _process_node_paths(graph_data, "u", "r", "main")

    api_node = next(n for n in output["nodes"] if n["id"] == "api")
    core_node = next(n for n in output["nodes"] if n["id"] == "core")

    assert api_node["clickUrl"] == "https://github.com/u/r/blob/main/src/api.ts"
    assert core_node["clickUrl"] == "https://github.com/u/r/tree/main/src/core"


def test_process_node_paths_drilldown_mode():
    graph_data = {
        "nodes": [
            {"id": "api", "label": "API", "type": "service", "path": "src/api.ts"},
            {"id": "core", "label": "Core", "type": "service", "path": "src/core"},
        ],
        "edges": [],
        "groups": [],
    }
    output = _process_node_paths(graph_data, "u", "r", "main", drill_down=True)

    api_node = next(n for n in output["nodes"] if n["id"] == "api")
    core_node = next(n for n in output["nodes"] if n["id"] == "core")

    # Files still get GitHub URLs in drill-down mode
    assert api_node["clickUrl"] == "https://github.com/u/r/blob/main/src/api.ts"
    # Directories get drill-down action
    assert core_node["clickAction"] == "drilldown"
    assert core_node["clickPath"] == "src/core"
