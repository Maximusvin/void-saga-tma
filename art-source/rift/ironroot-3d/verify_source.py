from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


EXPECTED_ACTIONS = {
    "Death": (1, 25),
    "HitLeft": (1, 14),
    "HitRight": (1, 14),
    "Idle": (1, 241),
}

SAMPLE_FRAMES = {
    "Idle": (1, 61, 121, 181, 241),
    "HitLeft": (1, 4, 8, 14),
    "HitRight": (1, 4, 8, 14),
    "Death": (1, 6, 12, 18, 25),
}


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--render-dir", type=Path)
    parser.add_argument("--export", type=Path)
    return parser.parse_args(argv)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_glb_json(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    if len(data) < 20 or data[:4] != b"glTF":
        raise ValueError("raw export has an invalid GLB header")
    version, byte_length, json_length, json_type = struct.unpack_from("<4I", data, 4)
    if version != 2 or byte_length != len(data) or json_type != 0x4E4F534A:
        raise ValueError("raw export has an invalid glTF 2.0 container")
    return json.loads(data[20 : 20 + json_length].decode("utf-8").strip())


def hidden_from_render(obj: bpy.types.Object) -> bool:
    return obj.hide_render or any(collection.hide_render for collection in obj.users_collection)


def point_camera(camera: bpy.types.Object, target: Vector) -> None:
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


def add_area_light(name: str, location: tuple[float, float, float], energy: float, size: float) -> None:
    data = bpy.data.lights.new(name=name, type="AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    light = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(light)
    light.location = location
    point_camera(light, Vector((0.0, 0.0, 0.48)))


def configure_render() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new("QA_World")
    scene.world.color = (0.012, 0.016, 0.026)

    camera_data = bpy.data.cameras.new("QA_Camera")
    camera_data.lens = 58
    camera = bpy.data.objects.new("QA_Camera", camera_data)
    scene.collection.objects.link(camera)
    camera.location = (0.0, -2.55, 0.58)
    point_camera(camera, Vector((0.0, 0.0, 0.48)))
    scene.camera = camera

    add_area_light("QA_Key", (-1.35, -1.7, 2.15), 750.0, 1.6)
    add_area_light("QA_Fill", (1.35, -0.8, 1.35), 420.0, 1.3)
    add_area_light("QA_Rim", (0.2, 1.25, 1.75), 900.0, 1.0)


def render_samples(armature: bpy.types.Object, output_dir: Path) -> list[str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    configure_render()
    rendered: list[str] = []
    animation_data = armature.animation_data_create()

    for action_name, frames in SAMPLE_FRAMES.items():
        action = bpy.data.actions[action_name]
        animation_data.action = None
        for pose_bone in armature.pose.bones:
            pose_bone.matrix_basis = Matrix.Identity(4)
        bpy.context.view_layer.update()
        animation_data.action = action
        if hasattr(animation_data, "action_slot") and action.slots:
            animation_data.action_slot = action.slots[0]
        for frame in frames:
            bpy.context.scene.frame_set(frame)
            bpy.context.view_layer.update()
            output = output_dir / f"{action_name.lower()}-{frame:03d}.png"
            bpy.context.scene.render.filepath = str(output)
            bpy.ops.render.render(write_still=True)
            rendered.append(str(output))

    return rendered


def export_raw_glb(armature: bpy.types.Object, mesh: bpy.types.Object, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.context.scene.frame_set(1)
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_extra_animations=True,
        export_force_sampling=True,
        export_skins=True,
        export_morph=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_yup=True,
    )


def main() -> None:
    args = parse_args()
    scene = bpy.context.scene
    source_path = Path(bpy.data.filepath)
    failures: list[str] = []

    meshes = [obj for obj in scene.objects if obj.type == "MESH" and not hidden_from_render(obj)]
    armatures = [obj for obj in scene.objects if obj.type == "ARMATURE" and not hidden_from_render(obj)]
    action_ranges = {
        action.name: tuple(round(value) for value in action.frame_range)
        for action in bpy.data.actions
    }

    if len(meshes) != 1:
        failures.append(f"expected one renderable mesh, found {len(meshes)}")
    if len(armatures) != 1:
        failures.append(f"expected one renderable armature, found {len(armatures)}")
    if action_ranges != EXPECTED_ACTIONS:
        failures.append(f"unexpected actions: {action_ranges}")

    mesh = meshes[0] if meshes else None
    armature = armatures[0] if armatures else None
    max_influences = 0
    triangles = 0
    if mesh is not None:
        mesh.data.calc_loop_triangles()
        triangles = len(mesh.data.loop_triangles)
        max_influences = max(
            (sum(1 for group in vertex.groups if group.weight > 0.0) for vertex in mesh.data.vertices),
            default=0,
        )
        if len(mesh.material_slots) != 1:
            failures.append(f"expected one material, found {len(mesh.material_slots)}")
        if not any(modifier.type == "ARMATURE" for modifier in mesh.modifiers):
            failures.append("character mesh has no armature modifier")
        if max_influences > 4:
            failures.append(f"maximum vertex influences is {max_influences}, expected at most 4")

    bone_count = len(armature.data.bones) if armature is not None else 0
    if armature is not None and any(abs(axis - 1.0) > 1e-6 for axis in armature.scale):
        failures.append(f"armature object scale is {tuple(armature.scale)}")

    rendered: list[str] = []
    exported: dict[str, object] | None = None
    if not failures and armature is not None and mesh is not None:
        if args.render_dir is not None:
            rendered = render_samples(armature, args.render_dir)
        if args.export is not None:
            export_raw_glb(armature, mesh, args.export)
            glb = read_glb_json(args.export)
            exported_actions = sorted(
                animation.get("name")
                for animation in glb.get("animations", [])
                if isinstance(animation, dict)
            )
            if exported_actions != sorted(EXPECTED_ACTIONS):
                failures.append(f"raw export has unexpected actions: {exported_actions}")
            if len(glb.get("meshes", [])) != 1 or len(glb.get("skins", [])) != 1:
                failures.append("raw export must contain exactly one mesh and one skin")
            exported = {
                "path": str(args.export),
                "bytes": args.export.stat().st_size,
                "sha256": sha256(args.export),
                "animations": exported_actions,
                "meshes": len(glb.get("meshes", [])),
                "skins": len(glb.get("skins", [])),
            }

    report = {
        "schema": "void-saga.ironroot-source-verification.v1",
        "blender": bpy.app.version_string,
        "source": {
            "path": str(source_path),
            "sha256": sha256(source_path),
        },
        "character": {
            "renderableMeshes": len(meshes),
            "armatures": len(armatures),
            "triangles": triangles,
            "bones": bone_count,
            "materials": len(mesh.material_slots) if mesh is not None else 0,
            "maximumVertexInfluences": max_influences,
            "armatureObjectScale": list(armature.scale) if armature is not None else None,
        },
        "actions": action_ranges,
        "renderedFrames": rendered,
        "rawExport": exported,
        "failures": failures,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))

    if failures:
        raise RuntimeError("Ironroot source verification failed")


if __name__ == "__main__":
    main()
