"""Bind isolated extraction analysis to its frozen construction inputs."""
from pathlib import Path
import ast, hashlib, json

ROOT = Path(__file__).resolve().parents[2]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def input_binding(input_root, plan=None):
    root = Path(input_root).resolve()
    paths = {"source": root / "board.circuit.json",
             "handoff": root / "field-solver-handoff.json",
             "stackup": root / "selected.json"}
    handoff = json.loads(paths["handoff"].read_text())
    stackup = json.loads(paths["stackup"].read_text())
    hashes = {key + "Sha256": sha(path) for key, path in paths.items()}
    assert handoff["sourceSha256"] == hashes["sourceSha256"], "Frozen board/handoff mismatch"
    source = Path(handoff["sourceFile"])
    source = source if source.is_absolute() else ROOT / source
    assert source.resolve() == paths["source"], "Handoff points outside the frozen board snapshot"
    assert handoff["stackup"] == stackup, "Frozen handoff/selected stackup mismatch"
    if plan is not None:
        for key in ["sourceSha256", "handoffSha256"]:
            assert plan[key] == hashes[key], ("Campaign input binding mismatch", key)
    return {**hashes, "stackupCode": stackup["code"],
            "controlHeightMm": stackup["dielectrics"][0]["thicknessMm"],
            "inputRoot": str(root),
            "inputFiles": {key: str(path) for key, path in paths.items()}}


def function_ast(path, name):
    node = next(n for n in ast.parse(Path(path).read_text()).body
                if isinstance(n, ast.FunctionDef) and n.name == name)
    return ast.dump(node, include_attributes=False)


def reuse_rotation(output_root, source_file=None):
    """Reuse only the axis/probe algorithm check, with explicit evidence."""
    source_file = Path(source_file).resolve() if source_file else (
        ROOT / "dist/si-channel-review/all-channels/rotation-check.json")
    rotation = json.loads(source_file.read_text())
    assert rotation.get("complete") and rotation.get("passed"), "Rotation probe calibration is incomplete"
    for name, digest in rotation["inputSha256"].items():
        path = Path(name)
        path = path if path.is_absolute() else ROOT / path
        assert sha(path) == digest, ("Rotation calibration input changed", str(path))
    rotated = Path(rotation["rotatedCase"])
    rotated = rotated if rotated.is_absolute() else ROOT / rotated
    reference = Path(rotation["reference"])
    reference = reference if reference.is_absolute() else ROOT / reference
    comparisons = []
    for old, current, names in [
        (rotated / "generalized-probes-source.py", ROOT / "simulations/channel-si/batch_em3d.py", ["measurement"]),
        (reference / "driver-source.py", ROOT / "simulations/channel-si/em3d_line.py", ["index", "span"]),
    ]:
        for name in names:
            before, after = function_ast(old, name), function_ast(current, name)
            assert before == after, ("Probe algorithm changed since rotation calibration", name)
            comparisons.append({"function": name, "equivalent": True,
                                "astSha256": hashlib.sha256(before.encode()).hexdigest(),
                                "calibratedSource": str(old), "calibratedSourceSha256": sha(old),
                                "currentSource": str(current), "currentSourceSha256": sha(current)})
    rotation["reuseEvidence"] = {
        "sourceCalibration": str(source_file), "sourceCalibrationSha256": sha(source_file),
        "astComparisons": comparisons,
        "scope": "Reuse of the unchanged coordinate-axis/current-probe algorithm only.",
        "rationale": "The generalized measurement function and its index/span helpers have identical ASTs to the calibrated sources. The height change is an input to these geometry-based algorithms. This evidence does not calibrate the selected cross-section, propagation or impedance; separate selected-height native line controls and a new independent 2D reference remain mandatory.",
    }
    rotation["inputSha256"][str(source_file)] = sha(source_file)
    for row in comparisons:
        for prefix in ["calibrated", "current"]:
            rotation["inputSha256"][row[prefix + "Source"]] = row[prefix + "SourceSha256"]
    target = Path(output_root) / "rotation-check.json"
    target.write_text(json.dumps(rotation, indent=2) + "\n")
    return rotation
