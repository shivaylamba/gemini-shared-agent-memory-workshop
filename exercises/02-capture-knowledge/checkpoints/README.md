# Checkpoint: Exercise 02

`knowledge/` holds six reviewed reference notes written by the workshop authors (`contributed_by: workshop-checkpoint`).
They follow the same format and validation as agent proposals.

```bash
npm run checkpoint -- 02             # write them into /knowledge through OpenLore (as maintainer)
npm run checkpoint -- 02 --replace   # also overwrite notes you already approved
```

If OpenLore is stopped, the files are copied into the served folder directly (no OpenLore history entry).
