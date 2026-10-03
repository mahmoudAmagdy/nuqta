# Azure fixtures

`read-arabic-invoice-lines.json` is **hand-built** from the documented
`prebuilt-read` response schema (API version 2024-11-30). It is not a recording
of a real call: no Azure credential was available when the provider was written.

It exercises the mapper's logic (words joined to lines by span, flat polygons,
confidence passthrough). It cannot show that Azure's real Arabic output matches
this shape in every detail. Replace it with a recorded response as soon as a
key exists, and keep this note honest when that happens.
