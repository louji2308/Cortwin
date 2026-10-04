import json
import os
import sys

import bpy
from mathutils import Vector

ROOT = r"C:\Users\LOUJAN B\Aquix"
RAW = os.path.join(ROOT, "assets", "raw", "bp3d4_99")
READY = os.path.join(ROOT, "assets", "ready")
PREVIEW = os.path.join(ROOT, "assets", "preview")
OUT_GLB = os.path.join(READY, "heart.glb")

GROUPS = {
    "HEART": (
        [f"FJ{i}" for i in range(2417, 2428)]
        + [f"FJ{i}" for i in range(2429, 2440)]
        + ["FJ2655", "FJ2656", "FJ2724", "FJ2727", "FJ2728", "FJ2729", "FJ2731", "FJ2737"]
    ),
    "AORTA": ["FJ1931", "FJ1932", "FJ3411", "FJ3413", "FJ3427"],
    "LAD": [f"FJ{i}" for i in range(2631, 2649)],
    "LCX": [f"FJ{i}" for i in range(2649, 2655)],
    "RCA": (
        ["FJ2667", "FJ2668"]
        + [f"FJ{i}" for i in range(2670, 2678)]
        + [f"FJ{i}" for i in range(2692, 2701)]
        + [f"FJ{i}" for i in range(2714, 2724)]
    ),
}

COLORS = {
    "HEART": (0.82, 0.80, 0.78, 1.0),
    "AORTA": (0.70, 0.74, 0.80, 1.0),
    "LAD": (0.85, 0.25, 0.25, 1.0),
    "LCX": (0.25, 0.55, 0.85, 1.0),
    "RCA": (0.25, 0.70, 0.40, 1.0),
}

HEART_DECIMATE = float(os.environ.get("HEART_DECIMATE", "0.6"))
SCALE = 0.001
AORTA_TRIM = os.environ.get("AORTA_TRIM", "heart").lower()


def trim_aorta(report):
    if AORTA_TRIM in ("full", "0", "off"):
        report["_aortaTrim"] = "full (source extent retained)"
        return
    heart = bpy.data.objects["HEART"]
    zmin_h = min((heart.matrix_world @ Vector(c)).z for c in heart.bound_box)
    zcut = zmin_h + 0.002
    aorta = bpy.data.objects["AORTA"]
    before = tri_count(aorta)
    bpy.ops.object.select_all(action="DESELECT")
    aorta.select_set(True)
    bpy.context.view_layer.objects.active = aorta
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    try:
        bpy.ops.mesh.bisect(
            plane_co=(0.0, 0.0, zcut),
            plane_no=(0.0, 0.0, 1.0),
            use_fill=True,
            clear_inner=True,
        )
    except TypeError:
        bpy.ops.mesh.bisect(
            plane_co=(0.0, 0.0, zcut),
            plane_no=(0.0, 0.0, 1.0),
            clear_inner=True,
        )
    bpy.ops.object.mode_set(mode="OBJECT")
    report["_aortaTrim"] = (
        f"bisect z<={zcut:.4f} m (heart inferior + 2 mm); "
        f"aorta triangles {before} -> {tri_count(aorta)}"
    )
    report["_aortaTrimZ"] = round(zcut, 5)


def tri_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def clean_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def ensure_material(name, rgba):
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Roughness"].default_value = 0.55
        bsdf.inputs["Metallic"].default_value = 0.0
    mat.diffuse_color = rgba
    return mat


def build():
    clean_scene()
    os.makedirs(READY, exist_ok=True)
    report = {}
    for name, ids in GROUPS.items():
        files = []
        missing = []
        for fid in ids:
            p = os.path.join(RAW, fid + ".obj")
            if os.path.exists(p):
                files.append({"name": os.path.basename(p)})
            else:
                missing.append(fid)
        if missing:
            raise SystemExit(f"{name}: missing raw files {missing}")
        before = set(bpy.data.objects)
        bpy.ops.wm.obj_import(
            directory=RAW + os.sep,
            files=files,
            forward_axis="NEGATIVE_Y",
            up_axis="Z",
        )
        new_objs = [o for o in bpy.data.objects if o not in before]
        bpy.ops.object.select_all(action="DESELECT")
        for o in new_objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = new_objs[0]
        if len(new_objs) > 1:
            bpy.ops.object.join()
        obj = bpy.context.view_layer.objects.active
        obj.name = name
        obj.data.name = name
        obj.rotation_euler = (0.0, 0.0, 0.0)
        obj.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        report[name] = {"sourceFiles": len(files), "trianglesIn": tri_count(obj)}

    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = bpy.data.objects["HEART"]
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for obj in bpy.data.objects:
        obj.scale = (SCALE, SCALE, SCALE)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    for name in GROUPS:
        obj = bpy.data.objects[name]
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.remove_doubles(threshold=0.00005)
        try:
            bpy.ops.mesh.normals_make_consistent(inside=False)
        except RuntimeError as exc:
            raise RuntimeError(
                f"normals_make_consistent failed for {name}: {exc}"
            ) from exc
        bpy.ops.object.mode_set(mode="OBJECT")
        if name == "HEART" and HEART_DECIMATE < 1.0:
            mod = obj.modifiers.new("decimate", "DECIMATE")
            mod.ratio = HEART_DECIMATE
            bpy.ops.object.modifier_apply(modifier=mod.name)
        report[name]["trianglesOut"] = tri_count(obj)

    trim_aorta(report)

    mins = Vector((1e18, 1e18, 1e18))
    maxs = Vector((-1e18, -1e18, -1e18))
    for obj in bpy.data.objects:
        for corner in obj.bound_box:
            w = obj.matrix_world @ Vector(corner)
            mins = Vector(tuple(min(mins[i], w[i]) for i in range(3)))
            maxs = Vector(tuple(max(maxs[i], w[i]) for i in range(3)))

    EXPECT_X_MIN = -0.0363
    EXPECT_X_MAX = 0.0794
    EXPECT_Z_MAX = 1.3171
    problems = []
    if abs(mins[0] - EXPECT_X_MIN) > 0.005:
        problems.append(f"x min {mins[0]:.4f} != {EXPECT_X_MIN}")
    if abs(maxs[0] - EXPECT_X_MAX) > 0.005:
        problems.append(f"x max {maxs[0]:.4f} != {EXPECT_X_MAX}")
    if maxs[1] > -0.040:
        problems.append(f"y max {maxs[1]:.4f} should be negative (anterior, BP3D y<0)")
    if abs(maxs[2] - EXPECT_Z_MAX) > 0.005:
        problems.append(f"z max {maxs[2]:.4f} != {EXPECT_Z_MAX} (superior)")
    if AORTA_TRIM not in ("full", "0", "off") and mins[2] < 1.170:
        problems.append(f"z min {mins[2]:.4f} below heart (aorta trim failed)")
    if sorted(o.name for o in bpy.data.objects) != sorted(GROUPS):
        problems.append(f"unexpected objects {[o.name for o in bpy.data.objects]}")
    if problems:
        raise SystemExit("orientation assertion failed: " + "; ".join(problems))

    center = (mins + maxs) / 2
    for obj in bpy.data.objects:
        obj.location -= center
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

    cmins = Vector((1e18, 1e18, 1e18))
    cmaxs = Vector((-1e18, -1e18, -1e18))
    for obj in bpy.data.objects:
        for corner in obj.bound_box:
            w = obj.matrix_world @ Vector(corner)
            cmins = Vector(tuple(min(cmins[i], w[i]) for i in range(3)))
            cmaxs = Vector(tuple(max(cmaxs[i], w[i]) for i in range(3)))

    for name, rgba in COLORS.items():
        obj = bpy.data.objects[name]
        mat = ensure_material("mat_" + name, rgba)
        obj.data.materials.clear()
        obj.data.materials.append(mat)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
        export_normals=True,
        export_texcoords=False,
        export_cameras=False,
        export_lights=False,
    )

    total = sum(tri_count(o) for o in bpy.data.objects)
    report["_totalTriangles"] = total
    report["_glbBytes"] = os.path.getsize(OUT_GLB)
    report["_preCenterBoundsMeters"] = {
        "min": [round(v, 4) for v in mins],
        "max": [round(v, 4) for v in maxs],
        "size": [round(maxs[i] - mins[i], 4) for i in range(3)],
    }
    report["_centeredBoundsMeters"] = {
        "min": [round(v, 4) for v in cmins],
        "max": [round(v, 4) for v in cmaxs],
        "size": [round(cmaxs[i] - cmins[i], 4) for i in range(3)],
    }
    report["_centeredAt"] = [round(v, 5) for v in center]
    report["_orientationCheck"] = "PASS (BodyParts3D mm -> m, +X left, -Y anterior, +Z superior)"
    with open(os.path.join(READY, "heart.build.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2)
    print(json.dumps(report, indent=2))


def render():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=OUT_GLB)
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            col = COLORS.get(obj.name, (0.7, 0.7, 0.7, 1.0))
            obj.color = col
            for slot in obj.material_slots:
                if slot.material:
                    slot.material.diffuse_color = col
    scene = bpy.context.scene
    engine = None
    for cand in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "BLENDER_WORKBENCH"):
        try:
            scene.render.engine = cand
            engine = cand
            break
        except TypeError:
            continue
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 960
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new("W")
    scene.world.use_nodes = True
    bg = next(n for n in scene.world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (0.05, 0.055, 0.07, 1.0)
    bg.inputs[1].default_value = 1.0

    light_data = bpy.data.lights.new("key", type="AREA")
    light_data.energy = 400
    light_data.size = 3
    key = bpy.data.objects.new("key", light_data)
    scene.collection.objects.link(key)
    key.location = (0.5, -0.6, 0.6)
    key.rotation_euler = (0.9, 0.0, 0.6)
    fill_data = bpy.data.lights.new("fill", type="AREA")
    fill_data.energy = 120
    fill_data.size = 4
    fill = bpy.data.objects.new("fill", fill_data)
    scene.collection.objects.link(fill)
    fill.location = (-0.6, 0.5, 0.3)
    fill.rotation_euler = (1.2, 0.0, -2.2)

    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 40
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    os.makedirs(PREVIEW, exist_ok=True)
    views = [
        ("overview", (0.35, -0.62, 0.18), (0.0, 0.0, 0.0)),
        ("anterior", (0.0, -0.55, 0.02), (0.0, 0.0, 0.0)),
        ("vessels", (0.16, -0.34, 0.10), (0.0, -0.01, 0.06)),
        ("superior", (0.05, -0.28, 0.42), (0.0, 0.0, 0.06)),
    ]
    for label, loc, target in views:
        cam.location = loc
        direction = Vector(target) - Vector(loc)
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(PREVIEW, f"heart_{label}.png")
        bpy.ops.render.render(write_still=True)
        print("rendered", scene.render.filepath, "engine", engine)


if __name__ == "__main__":
    mode = sys.argv[-1] if sys.argv else "build"
    if mode == "render":
        render()
    else:
        build()
