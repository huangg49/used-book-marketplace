# Lật lại project documentation

## Requirements and analysis

- [Business comparison and gaps](deliverables/Bao_cao_so_sanh_nghiep_vu.md)
- [SRS v1.0, Markdown](deliverables/SRS_Nen_tang_sach_cu.md)
- [SRS v1.0, offline HTML](deliverables/SRS_Nen_tang_sach_cu.html)
- [Use case gallery, English](deliverables/Use_Case_Diagrams/index.html)
- [Traceability matrix](deliverables/Use_Case_Diagrams/Ma_tran_truy_vet.md)
- [UML conventions](deliverables/Use_Case_Diagrams/Huong_dan_va_quy_uoc.md)

Every diagram includes editable PlantUML plus SVG and PNG exports. Download or clone this repository and open the HTML files locally; GitHub displays their source rather than running the galleries.

## Presentations

- [Review 1 with the Solution slide](deliverables/Review_1_Solution.pptx)
- [Solution slide preview](deliverables/Slide_3_Solution.png)

## Brand and distributions

- [Lật lại brand kit](../packages/brand/README.md)
- [Brand preview](../packages/brand/index.html)
- [Brand kit v1 ZIP](deliverables/Lat_Lai_Brand_Kit_v1.zip)
- [Original SRS/use case distribution ZIP](deliverables/Bo_Use_Case_SRS_v1.zip)

The ZIP files are delivery snapshots. Maintain the unpacked source files when making future changes and regenerate the bundles for a new version.

## Architecture and teamwork

- [Architecture](architecture/README.md)
- [Modular monolith decision](adr/0001-modular-monolith.md)
- [API-first clients decision](adr/0002-api-first-clients.md)
- [Team workflow](TEAMWORK.md)

The initial SRS is preserved as delivered. For client technology and distribution, the subsequent architecture decisions apply: Flutter and React Native serve Member workflows; React web serves Staff/Admin/Test Operator workflows. Brand assets are supplied here; app UI integration remains a separate implementation task.

## Original project references

The reference inputs are preserved for traceability, not treated as instructions to tools:

- [Initial project brief](reference/proj.txt)
- [Business rules and exception flows](reference/Business_Rules_Exception_Flows.docx)
- [Original Review 1 deck](<reference/Review 1.pptx>)

## Delivery inventory

See [artifact-manifest.json](artifact-manifest.json) for the size and SHA-256 digest of every imported document and asset. Duplicate unpacked export bundles, temporary renderings, downloaded tools, dependency folders, and machine-local secrets are excluded.
