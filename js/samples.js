/*
 * bitforge — bundled sample fonts (DECISIONS #77).
 *
 * Samples are EMBEDDED here as strings instead of being fetched from a
 * samples/ folder: the app must stay file://-safe (browsers block fetch()
 * of local files), and this keeps "no build step" true.
 *
 * Entry shape:
 *   {
 *     id:          "slug",           // stable, used for keying/tests
 *     name:        "Display name",   // shown in File > Load sample…
 *     description: "One line about the sample",
 *     default:     true,             // OPTIONAL — first-run preload target
 *     json:        "<the .bitforge project file as a string>"
 *   }
 * `json` is exactly what File > Export project… produces (the same object
 * shape BF.objFromProject validates on import).
 *
 * FIRST-RUN PRELOAD: on a machine with no saved font, bitforge loads the
 * first entry flagged `default` (else the first entry). With an empty
 * registry the app starts blank, exactly as before.
 *
 * HOW TO ADD A SAMPLE (agent procedure, see AGENTS.md):
 *   1. Take the .bitforge file (user-exported or attached).
 *   2. Read it; it must parse and pass BF.objFromProject validation
 *      (the headless test suite checks every registered entry — a bad
 *      sample fails the build).
 *   3. Append an entry here (json = the file's text, JSON.stringify'd).
 *   4. Bump BF.VERSION + changelog entries (both), commit.
 */
var BF_SAMPLES = [
];
