# Asset attribution and licence record

**Owner:** B0-3 (3D asset risk / mesh gate) · **Created:** 2026-10-03 · **Status:** CONDITIONAL PASS — HD-07 open (see below)

Every asset under `assets/` is listed here. Nothing else exists in this tree.

---

## 1. Source mesh — BodyParts3D / ISA BP3D 4.0 (IS-A tree, 99% polygon reduction)

| Field | Value |
|---|---|
| Product | **BodyParts3D** (Life Science Integrated Database Center / Database Center for Life Science), distributed via the LSDB Archive (NBDC) |
| Archive file | `isa_BP3D_4.0_obj_99.zip` — "Polygon mesh data (Polygon reduction rate = 99% IS-A Tree)" |
| Local copy | `assets/raw/isa_BP3D_4.0_obj_99.zip` — 142,903,898 bytes, 2,234 entries, retrieved **2026-10-03 11:44 (local)** |
| Download page (verified 2026-10-03) | `https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html` |
| Direct location (per LSDB download page) | `https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_BP3D_4.0_obj_99.zip` |
| Version | BodyParts3D release 4.0 (2013-05-16) |
| Sidecars present in `assets/raw/` | `isa_parts_list_e.txt`, `isa_inclusion_relation_list.txt`, `isa_element_parts.txt`, `partof_parts_list_e.txt`, `partof_element_parts.txt`, `coordinate_system.png` — all named exactly as the corresponding items 1–7 on the LSDB download page |
| Paper | Mitsuhashi N, Fujieda K, Tamura T, Kawamoto S, Takagi T, Okubo K. *BodyParts3D: 3D structure database for anatomical concepts.* Nucleic Acids Res. 2009 Jan;37(Database issue):D782-5. |
| Local identification evidence | File name, size class (LSDB lists "136 MB" = 142,903,898 B), entry count and sidecar names all match the LSDB item 8 + items 1–7 listing, fetched 2026-10-03 |

### Licence — two official statements that disagree (HD-07)

**Statement A — LSDB Archive licence page (the site we actually downloaded from).**
Source: `https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html` — retrieved 2026-10-03, page states "Last updated : 2025/02/27". Verbatim:

> "The license for this database is specified in the Creative Commons Attribution 4.0 International. If you use data from this database, please be sure attribute this database as follows: **'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International'**."
>
> "With regard to this database, you are licensed to: freely access part or whole of this database, and acquire data; freely redistribute part or whole of the data from this database; and freely create and distribute database and other derivative works based on part or whole of the data from this database, under the license, as long as you comply with the following conditions: You must attribute this database in the manner specified by the author or licensor when distributing part or whole of this database or any adapted material."

**Statement B — BodyParts3D / Anatomography project site.**
Source: `https://lifesciencedb.jp/bp3d/info_en/license/index.html` — retrieved 2026-10-03. Verbatim (Japanese, official page):

> 「本サイト(http://lifesciencedb.jp/bp3d, http://lifesciencedb.jp/ag）で公開しているコンテンツ（Anatomographyで作成した画像を含む）の標準利用許諾は、以下の通りです。 クリエイティブ・コモンズ 表示-継承2.1 日本」
>
> 「利用にあたり以下のクレジットを必ず表示してください。 **BodyParts3D, Copyrightc 2008 ライフサイエンス統合データベースセンター 　licensed by CC表示－継承2.1 日本**」

Translation of the licence name: *Creative Commons Attribution-Inheritance 2.1 Japan* (CC BY-SA 2.1 JP).

**The conflict:** the archive we downloaded from says **CC BY 4.0** (attribution only, updated 2025); the originating project site says **CC BY-SA 2.1 JP** (attribution **+ share-alike on derivatives**). Both are official and both are current as of 2026-10-03. They differ exactly on whether share-alike attaches to `heart.glb` and the previews.

**Interim handling applied by B0-3 (conservative, satisfies both):**

1. `assets/ready/heart.glb`, `assets/ready/heart.build.json`, `assets/preview/*.png` are **adapted material** and are released under **CC Attribution-ShareAlike 2.1 Japan (CC BY-SA 2.1 JP)** — the stricter of the two. Complying with BY-SA also satisfies BY 4.0's attribution requirement, so this is valid under either statement.
2. Both required credits are displayed, verbatim, in §2 below (satisfying Statement A's specified credit and Statement B's specified credit simultaneously).
3. `assets/raw/` (unmodified download) is **not redistributed** by this project — it is `.gitignore`d and only the derived, licence-cleared assets ship.

### HD-07 — Licence ambiguity (awaiting human decision)

```text
BLOCKED / Decision ID:        HD-07
Contract(s):                  C-01 (manifest / attribution), C-16 (structure budgets — unaffected)
Problem:                      Two official, current licence statements for BodyParts3D disagree:
                              LSDB Archive (our download source) = CC BY 4.0; originating project
                              site = CC BY-SA 2.1 JP. They differ only on share-alike.
Evidence:                     https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html
                              (retrieved 2026-10-03, "Last updated : 2025/02/27", CC BY 4.0 text)
                              https://lifesciencedb.jp/bp3d/info_en/license/index.html
                              (retrieved 2026-10-03, 「クリエイティブ・コモンズ 表示-継承2.1 日本」)
Impact if unresolved:         Attribution string and derivative licence on heart.glb + previews
                              are not authoritatively fixed; README / ATTRIBUTION can state only
                              the conservative interim licence above.
Option A -> consequence:      Ship heart.glb + previews under CC BY-SA 2.1 JP with BOTH credit
                              strings displayed. Satisfies either reading. Share-alike then
                              attaches to the mesh asset (not to CorTwin's own source code).
                              Already implemented as the interim state.
Option B -> consequence:      Rely on the archive's CC BY 4.0 (newer, share-alike absent). Simpler
                              for redistribution, but rests on one of two conflicting statements.
Safety / privacy impact:      None. No patient data in any mesh.
Cost impact:                  None.
Release impact:               Public demo must carry the credit lines either way; only the
                              derivative's licence label changes.
Required human decision:      Confirm which statement governs `isa_BP3D_4.0_obj_99.zip`
                              derivatives, and confirm credit wording for README + demo.
```

---

## 2. Credits to display (both, verbatim — until HD-07 is resolved)

```text
BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International
BodyParts3D, Copyrightc 2008 ライフサイエンス統合データベースセンター licensed by CC表示－継承2.1 日本
```

---

## 3. Derivatives produced by this project

| Artifact | Bytes | sha256 | Derived from | Licence |
|---|---:|---|---|---|
| `assets/ready/heart.glb` | 1,409,060 | `f6fd044f86cb6ac8360bba2b4891ce07d341a4a9e9d6acdaef82b32f5e5d26b5` | BodyParts3D 4.0 OBJ parts (88 selected of 2,234) | CC BY-SA 2.1 JP (interim, HD-07) |
| `assets/ready/heart.build.json` | 1,287 | — build report, no geometry | derived from the same build | CC BY-SA 2.1 JP |
| `assets/preview/heart_overview.png` | 1,248,453 | — | render of `heart.glb` | CC BY-SA 2.1 JP |
| `assets/preview/heart_anterior.png` | 1,265,572 | — | render of `heart.glb` | CC BY-SA 2.1 JP |
| `assets/preview/heart_vessels.png` | 1,280,847 | — | render of `heart.glb` | CC BY-SA 2.1 JP |
| `assets/preview/heart_superior.png` | 1,259,997 | — | render of `heart.glb` | CC BY-SA 2.1 JP |

**Modifications applied** (permitted by §8 of AGENTS.md — import → align → merge → decimate → rename → export; no geometry authored): parts grouped into the five registry nodes `HEART, AORTA, LAD, LCX, RCA`; scale mm→m (×0.001); heart decimated to 0.6; aorta bisected at z = 1.18044 m (heart inferior + 2 mm); duplicate vertices removed, normals made consistent; re-centred to the world origin; five untextured base-colour materials added. Details in `assets/ready/heart.build.json`.

## 4. `assets/fallback/heart_tubes.glb` — no third-party geometry

| Artifact | Bytes | sha256 | Provenance | Licence |
|---|---:|---|---|---|
| `assets/fallback/heart_tubes.glb` | 378,644 | `fdb6cb98267da16b9b4b57fee1d352a47403a8533857b6d18d2ffd3e4fde4388` | Procedurally generated by `tools/mesh/build_tubes.mjs` from Catmull-Rom centrelines hand-placed in this repository | Project's own code output — **no BodyParts3D content**, no third-party licence attaches |

This is the sanctioned fallback geometry (AGENTS.md §8). It is explicitly *not* anatomically accurate and must never be presented as measured anatomy.

## 5. Tooling

| Component | Version | Licence | Where |
|---|---|---|---|
| `@gltf-transform/cli` + `core`/`functions`/`extensions` | 4.5.1 | MIT (`@gltf-transform/*/LICENSE.md`) | `tools/mesh/node_modules/` (build-time only, never shipped to the browser) |
| `gltf-validator` | (from gltf-transform CLI dependency tree) | MIT | build-time only |
| Blender (`bpy`) used to run `prepare_bp3d.py` | whatever is installed locally | GPL-3.0 (the *software*; output is not GPL-affected) | build-time only, not part of the shipped app |

Nothing in `tools/mesh/node_modules/` is bundled into `web/dist`; Vite only bundles from `web/`.

## 6. Non-assets

- `data/raw/*` is the UCI dataset, licensed **CC BY 4.0** — see `data/PROVENANCE.md`.
- No generated/ai 3D content exists anywhere under `assets/` (Hunyuan3D / Tripo / Rodin were never invoked; AGENTS.md §8 forbids them).
- No textures, no images embedded in either `.glb`, no ribs, lungs or decorative geometry.
