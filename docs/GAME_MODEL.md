# Game model

**Removed.** LiftOS used to score training through a game model — XP,
levels, traits, ladders, ratings and a monthly review, declared in one
registry under `src/domain/game/`. It went when the app became a plain
workout tracker, and this document went with it.

What survived is the part that was always a measurement: each lift
against published bodyweight standards, as plain numbers, in
`src/domain/strength/standards.ts`. The model, its rules and their
tests are in the git history.
