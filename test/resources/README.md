# Test fixtures

`borders-test.mcb` is the border data the tests load. It is built from
`borders-test.fgb`, a FlatGeobuf file with 7 synthetic features. Both files are
kept. Every alpha code must be one that `mapcode-ts` knows canonically, because
`mapcode-ts-borders` rejects the rest. The codes `BVT`, `HMD`, `SGS` and `PCN`
are real territories that produce no mapcodes inside the fixture polygons, so
they never change the mapcode order in a response.

Regenerate the `.mcb` file with the converter of `mapcode-ts-borders`, from a
checkout of that repository:

```bash
node --experimental-strip-types <mapcode-ts-borders>/scripts/convert-borders.mts \
  test/resources/borders-test.fgb test/resources/borders-test.mcb \
  --snapshot-date 2026-05 --source "mapcode-rest-service-ts test fixture"
```
