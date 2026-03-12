from integrations.stitch_mcp.exporter import normalize_tokens


def test_normalize_tokens_defaults() -> None:
    out = normalize_tokens({})
    assert out["colors"] == {}
    assert out["spacing"] == {}
    assert out["radii"] == {}
    assert out["typography"] == {}
    assert out["shadows"] == {}
    assert out["motion"] == {}

