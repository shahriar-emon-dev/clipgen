# ANTIGRAVITY MASTER PROMPT

# ANTIGRAVITY MASTER BUG-FIX & UI UPGRADE PROMPT
## Movie & Series Explanation Studio — Professional Full-Screen Video Editor

### OBJECTIVE

Upgrade my existing Movie & Series Explanation Studio using the attached screenshot as the reference for the current interface and problems.

The narration and voiceover timing are consistent, but the video clips are behaving incorrectly. Clips appear for about one second, jump back to their previous positions, and some shots still appear locked. Captions are too large and cover most of the video. The editing interface also does not use the available screen space efficiently.

**Fix the underlying functionality first, then improve the editor layout. Do not just redesign the UI.**

## 1. CRITICAL BUG: CLIPS FLASH, JUMP BACK, OR REVERT

Diagnose and fix why clips briefly appear, play for approximately one second, and then return to their previous positions.

Inspect:

- Timeline state management
- Clip IDs and source in/out timestamps
- Clip duration and playback calculations
- React state updates and component re-rendering
- Playback clock and playhead synchronization
- Timeline normalization and auto-reordering logic
- Drag-and-drop event handlers
- Clip replacement and save operations
- Preview player source selection
- Cached timeline data
- Backend persistence and rendering data
- Any automatic AI timeline regeneration that overwrites manual edits

### Required behaviour

- Every clip must remain at its assigned timeline position.
- Playback must advance continuously through the actual timeline sequence.
- The playhead must not jump backward unexpectedly.
- A clip must not revert to an older source or position after playback starts.
- Manual clip replacement, trimming, splitting, and repositioning must persist.
- The preview must use the latest timeline state.
- The exported video must use the same latest timeline state.
- AI re-matching must never silently overwrite manual edits.
- Refreshing the browser must not restore an obsolete timeline version.

Use stable clip IDs and one authoritative timeline state. Investigate stale closures, competing state sources, playback timers, and outdated cached data rather than applying superficial workarounds.

## 2. REMOVE UNINTENDED CLIP LOCKING

Some clips still display lock icons and cannot be edited as expected.

Inspect the permission logic, lock flags, generated-shot metadata, and UI event handlers.

Implement these rules:

- AI-generated clips must be editable by default.
- Allow selecting, moving, trimming, splitting, replacing, duplicating, and deleting clips.
- If a genuine technical restriction exists, explain it clearly.
- Provide an intentional Lock/Unlock control only when useful.
- Distinguish a user-created lock from a system restriction.
- Do not display a lock icon when the clip is actually editable.
- Never silently block a user's editing action.
- Preserve the existing three-second maximum for generated movie-footage clips.

Test that unlocked clips can be edited and that intentional locks work predictably.

## 3. ADVANCED CAPTION CONTROLS

The current captions are oversized and block the entire video. Replace the current oversized caption presentation with a professional subtitle system.

### A. Caption visibility

Add a clearly visible **Captions ON/OFF** toggle.

- When ON, display captions in the preview and final export according to the selected export settings.
- When OFF, hide captions in the preview.
- Provide a separate option to include or exclude captions in the final export.
- Keep caption data in the project when captions are hidden.
- Toggling visibility must not delete captions or change narration timing.

### B. Caption size and position

Add controls for:

- Font size
- Font family
- Font weight
- Text color
- Background opacity
- Outline thickness
- Shadow
- Horizontal alignment
- Vertical position
- Bottom margin
- Maximum text width
- Line spacing
- Letter spacing

Default to a compact, readable subtitle style near the bottom of the screen.

Do not allow captions to cover the entire video by default. Use a sensible maximum width and preferably one line when the text length permits it. Wrap into two lines only when necessary.

Use safe margins so captions remain visible on different aspect ratios.

### C. Caption templates

Provide professional presets such as:

- Minimal Bottom Subtitle
- Clean White Subtitle
- Cinematic Subtitle
- Typewriter
- Word-by-Word Highlight
- Karaoke Highlight
- Bold Emphasis
- Compact Two-Line Subtitle

Let the user preview each preset before applying it.

### D. Typewriter and advanced animation

Add optional typewriter-style animation, where characters appear progressively in sync with the narration.

Also support:

- Word-by-word reveal
- Selected-word highlighting
- Subtle fade-in and fade-out
- Optional background box
- Per-caption animation settings

Animations must follow the caption's actual timeline duration. Do not animate the entire caption repeatedly because the preview player re-renders.

### E. Caption editing

Allow the user to:

- Edit caption text
- Split and merge captions
- Adjust start and end times
- Move captions on the timeline
- Change styles for one caption or multiple selected captions
- Copy and paste caption styles
- Reset a caption to the default style
- Preview caption changes immediately

Keep captions synchronized with the voiceover. Editing visual clips must not shift caption timestamps unless the narration timeline itself is deliberately changed.

## 4. REDESIGN THE EDITOR INTO A PROFESSIONAL FULL-SCREEN WORKSPACE

The current interface wastes screen space and feels cramped. Redesign the editing workspace to use the available browser viewport efficiently, inspired by the practical layout of CapCut and Filmora.

Do not copy their proprietary assets or exact UI. Build a professional interface using my existing visual identity.

### Recommended layout

**Top toolbar**
- Project name
- Save status
- Undo and redo
- Preview quality
- Aspect ratio
- Timeline zoom
- Export

**Left panel**
- Media library
- Indexed scenes
- Replace shot
- Captions
- Text
- Audio
- Effects
- Rights and asset information

**Center panel**
- Large video preview
- Playback controls
- Current timecode and total duration
- Full-screen preview
- Caption preview

**Right panel**
- Selected clip inspector
- Transform
- Speed
- Color
- Effects
- Crop
- Border
- Caption settings when a caption is selected

**Bottom panel**
- Multi-track timeline
- Main video
- Voiceover
- Captions
- Text overlays
- Music and sound effects
- Timeline ruler
- Playhead
- Split and trim tools
- Zoom controls

### Full-screen requirements

- Use the available browser viewport height and width efficiently.
- Avoid a narrow editor floating in the middle of the screen.
- Minimize unnecessary outer margins.
- Keep the timeline large enough to edit clips comfortably.
- Allow the left and right panels to collapse or resize.
- Allow the timeline height to be resized.
- Support browser full-screen mode without breaking the layout.
- Prevent important controls from being clipped off-screen.
- Make the layout responsive to different screen sizes.

Do not force every setting to be visible simultaneously. Use panels, tabs, and collapsible sections.

## 5. TIMELINE INTERACTION AND PREVIEW

Make the timeline reliable and practical.

- Drag and drop clips to reorder them.
- Replace clips without resetting the project.
- Split clips at the playhead.
- Trim clip boundaries.
- Duplicate and delete clips.
- Move captions independently.
- Select clips and caption layers reliably.
- Support undo and redo.
- Save changes automatically or provide clear save feedback.
- Display the actual duration of each clip.
- Keep the playhead aligned with preview playback.
- Allow playback from the beginning, current playhead, selected clip, or selected range.

The preview must reflect current clip order, transforms, speed, color settings, captions, borders, and text overlays.

Do not require a complete final-resolution render for every editing adjustment. Use cached previews or lightweight preview rendering where appropriate.

## 6. ONE AUTHORITATIVE TIMELINE FOR PREVIEW AND EXPORT

Ensure that preview and export read from the same saved timeline revision.

When a clip is replaced, moved, split, trimmed, or adjusted:

1. Update the authoritative timeline state.
2. Persist the change.
3. Invalidate affected cached previews.
4. Refresh the preview using the updated state.
5. Ensure the renderer uses the same updated clip data.

Never use stale project snapshots for export.

Do not regenerate the whole timeline automatically after every manual change. Only update affected sections when possible.

## 7. PRESERVE EXISTING FEATURES

Keep all existing functionality, including:

- Movie and transcript inputs
- Full-video scene analysis
- Story Map & Intelligence
- AI Director Timeline
- Three-second maximum clip duration
- Voiceover synchronization
- Existing Ollama models and local processing
- Clip replacement
- Color grading and transforms
- Rendering and export
- Existing project saving and recovery

Use the existing architecture and FFmpeg pipeline where possible.

Do not introduce heavyweight AI models or paid APIs just to fix the editor.

## 8. REQUIRED TESTING

Use a short sample project first.

Verify:

1. Clips play continuously without flashing or reverting.
2. The playhead does not jump backward unexpectedly.
3. Manual clip changes persist after playback.
4. Replaced clips appear correctly in both preview and export.
5. Generated clips are editable by default.
6. Lock/unlock behaviour is correct.
7. Captions can be switched ON and OFF.
8. Caption font size can be reduced.
9. Captions default to a compact bottom-subtitle layout.
10. Typewriter and word-highlight animations work with narration timing.
11. Caption changes remain saved after refresh.
12. The editor uses the available screen space effectively.
13. The preview and export match the latest timeline revision.
14. The three-second maximum remains enforced.
15. Existing workflows continue to function.

Check browser console errors, backend logs, network requests, and rendering output. Do not claim the fix is complete until the relevant tests pass.

## IMPLEMENTATION ORDER

**Phase 1:** Diagnose and fix clip flashing, timeline jumps, stale state, and locking.

**Phase 2:** Implement caption visibility, size, position, templates, and animation controls.

**Phase 3:** Redesign the workspace into a professional full-screen editing layout.

**Phase 4:** Validate preview/export consistency and run regression tests.

### FINAL ACCEPTANCE CRITERION

I must be able to open my project, play the complete timeline smoothly, edit or replace any unlocked clip, adjust caption size and style, switch captions on or off, and work in a professional full-screen editor without clips jumping back or reverting.

The final rendered video must reflect the latest saved timeline and caption settings.

**Inspect the existing code first. Fix the underlying bugs, preserve existing functionality, implement real working controls, and test the result in the browser.**

## Add a New Sidebar Feature: AI Movie Analyzer & Multilingual Explanation Studio

### 1. PROJECT OBJECTIVE

Upgrade my existing **Movie & Series Explanation Studio** by adding a new, independent sidebar feature that transforms a full movie or episode and its original transcript into an engaging 8–10 minute explanation video workflow.

This must be an addition to the existing application, not a replacement.

The new feature must:

1. Accept a full movie or episode video.
2. Accept my original transcript as a `.txt` file.
3. Analyze the complete video and transcript.
4. Generate three separate 8–10 minute explanation scripts in English, Hindi, and Bangla.
5. Give each script a compelling opening hook lasting approximately 10–20 seconds.
6. Let me review and select the script and language I want to use.
7. Generate or import the corresponding voiceover.
8. Automatically match the narration with relevant scenes from across the entire movie.
9. Move into my existing movie explanation editing workflow for clipping, timeline editing, preview, and rendering.
10. Produce a polished, editable explanation video.

**Important:** The script generation stage must happen first. After scripts are generated and reviewed, the application should continue into the existing movie explanation workflow. Do not skip the script-review stage or automatically overwrite an existing project.

---

### 2. PRESERVE THE EXISTING APPLICATION

Before coding, inspect the complete repository and understand the existing architecture.

Preserve all existing features, including:

- Project Inputs
- Story Map & Intelligence
- AI Director Timeline
- Review & Quality
- Existing scene indexing and analysis
- Voiceover synchronization
- Clip replacement and timeline editing
- Rendering and export
- Existing project save/recovery behaviour
- Current user interface and sidebar navigation

Implement this as a modular, backward-compatible feature.

Do not rewrite working components unnecessarily. Reuse existing services, data models, rendering code, and API endpoints where appropriate.

Do not introduce mock data or nonfunctional placeholder buttons.

---

### 3. ADD A NEW SIDEBAR ENTRY

Add a clearly labelled sidebar item:

**AI Movie Analyzer & Explanation Script**

Create a dedicated workspace with these stages:

1. Upload Video & Transcript
2. Full Movie Analysis
3. Script Generation
4. Script Review & Language Selection
5. Voiceover
6. Scene Matching & Editing
7. Preview & Export

Use the existing dark UI theme and responsive layout.

The new feature must maintain its own project state while integrating with the existing movie explanation pipeline.

---

### 4. INPUTS: FULL MOVIE + ORIGINAL TXT TRANSCRIPT

The user must provide two required inputs:

**Input A — Full Movie or Episode**

- Support the existing video formats.
- Display filename, duration, resolution, codec, and file size when available.
- Use FFprobe to inspect technical metadata.
- Validate that the file is readable before starting analysis.

**Input B — Original Transcript**

- Accept `.txt` files.
- Read and preserve the original text.
- Display a transcript preview.
- Support long transcripts without truncating the source.
- Normalize encoding and line breaks without changing the intended meaning.
- Keep the original transcript separate from the AI-generated explanation script.

Do not silently substitute an automatically generated transcript for the supplied original transcript.

If the transcript is incomplete, contradictory, or appears unrelated to the video, flag the problem and ask the user to review it.

The original transcript is the primary source of truth for story facts. The full video supplies visual evidence, scene timing, characters, actions, and context.

---

### 5. FULL VIDEO ANALYSIS

Analyze the complete source video, not just the opening or a few selected frames.

Use an efficient multi-stage process:

**Stage A — Technical indexing**

- Extract duration, frame rate, resolution, and audio information.
- Generate thumbnails and scene-change candidates.
- Create timestamped scene segments.
- Identify missing, corrupt, or unreadable sections.
- Preserve accurate source timestamps.

**Stage B — Visual scene understanding**

Use the installed lightweight vision model to describe sampled frames and supported video segments.

For every indexed scene, store information such as:

- Scene ID
- Source start and end time
- Concise visual description
- Visible characters when identifiable
- Actions and important objects
- Location or setting when supported
- Emotional tone when visually evident
- Potential relevance to story events
- Analysis confidence
- Source frame or timestamp references

Do not invent events, dialogue, identities, or actions that the model cannot verify.

**Stage C — Transcript analysis**

Use the original transcript to identify:

- Characters and relationships
- Major story events
- Conflicts and mysteries
- Important reveals
- Emotional turning points
- Cause-and-effect relationships
- Important supporting details
- Climax and ending
- Events needed to understand the story

**Stage D — Story and scene alignment**

Compare the transcript-derived story structure against the indexed visual scenes.

Build a searchable scene index so the later editing workflow can locate relevant moments without repeatedly analyzing the entire source video.

If the visual model is uncertain, flag the scene for review instead of fabricating details.

---

### 6. USE MY TWO EXISTING OLLAMA MODELS

The application must reuse my existing local Ollama models:

- **Story and script reasoning:** `qwen3:4b`
- **Visual scene understanding:** `ahmadwaqar/smolvlm2-256m-video:q8_0`

Inspect the existing Ollama configuration and reuse it. Do not download duplicate models or silently switch to paid cloud APIs.

#### Qwen3:4b responsibilities

Use Qwen3:4b for:

- Transcript analysis
- Character and event extraction
- Story structure
- Climax and reveal identification
- Explanation outline generation
- Multilingual script generation
- Hook writing
- Script review and factual consistency checks
- Semantic matching between narration segments and scene descriptions

Pass structured text and indexed scene metadata to the model. Do not repeatedly send the entire full-resolution movie to the text model.

#### SmolVLM2 responsibilities

Use the existing lightweight vision model for:

- Frame and scene description
- Visual context understanding
- Scene indexing
- Candidate scene verification
- Narration-to-visual matching support
- Checking whether a selected shot appears relevant

Respect the model's actual capabilities and input requirements. If direct video input is unsupported in the current Ollama integration, use FFmpeg to extract representative frames or short segments in a controlled way.

Do not assume that a model understands a full movie merely because the full file was passed to an API.

#### Performance requirements

My computer has an Intel i3 CPU, approximately 20 GB total RAM, and a 1 GB GPU.

Therefore:

- Prefer CPU-compatible inference.
- Process visual analysis sequentially or in small batches.
- Avoid running both models concurrently when memory pressure is high.
- Limit frame sampling to useful scene boundaries and representative frames.
- Cache completed scene descriptions.
- Reuse cached transcript analysis and scene indexes.
- Reanalyze only affected material after an edit.
- Show progress and allow safe cancellation and resumption.

Never require a heavyweight model to complete ordinary tasks.

---

### 7. GENERATE THREE EXPLANATION SCRIPTS

After both inputs have been analyzed, generate three independent explanation scripts:

1. English
2. Hindi
3. Bangla

Each script must target **8–10 minutes of spoken narration**, not merely contain a fixed number of words.

Use an adjustable target duration, defaulting to approximately nine minutes. Estimate duration using the language's natural speaking pace and the selected voiceover settings.

Do not artificially stretch the script with repetition or filler just to meet the duration.

#### Opening hook

The first 10–20 seconds must be compelling and directly relevant to the story.

Use an appropriate combination of:

- An intriguing mystery
- A high-stakes situation
- An unexpected revelation
- A dramatic conflict
- A compelling unanswered question
- A surprising contradiction

The hook must be grounded in actual events from the supplied transcript and video.

Do not invent a twist, promise a reveal that never happens, or misrepresent the story.

#### Main explanation structure

Use a coherent structure such as:

1. Opening hook
2. Essential context
3. Main characters and their motivations
4. Inciting incident
5. Escalating conflict
6. Important discoveries and reversals
7. Climax
8. Resolution or ending
9. Memorable final takeaway

Adapt this structure to the actual movie instead of forcing every story into an identical template.

#### Language requirements

**English**
- Natural, engaging English narration.
- Clear transitions and strong storytelling.
- Avoid robotic or repetitive phrasing.

**Hindi**
- Natural Hindi narration.
- Preserve character names and story details.
- Avoid awkward literal translations from English.

**Bangla**
- Natural, conversational Bangla suitable for voiceover.
- Preserve important story details.
- Avoid unnatural translations or unnecessary English mixing.

The three scripts must tell the same essential story while sounding natural in their respective languages.

Do not generate three superficially different scripts that contradict each other.

#### Script output format

For each language, provide:

- Language name
- Proposed title
- Opening hook
- Complete narration script
- Paragraph or segment numbers
- Estimated spoken duration
- Character names and important events
- Suggested visual scene references
- Optional pronunciation notes
- Word or character count where useful

Store the three versions independently.

---

### 8. SCRIPT REVIEW AND SELECTION

Create a script review interface before voiceover generation.

Allow me to:

- Preview all three scripts.
- Switch between languages.
- Edit the generated script.
- Regenerate a selected paragraph.
- Rewrite the opening hook.
- Adjust target narration duration.
- Review story accuracy warnings.
- Save the script.
- Choose the language to produce.
- Export the script as TXT.

Do not discard a manually edited script when switching tabs or refreshing the browser.

The user must explicitly choose which language and script version to send into the existing movie explanation workflow.

Allow the user to return to script review later without repeating the full movie analysis.

---

### 9. VOICEOVER GENERATION OR IMPORT

After script approval, provide two options:

**Option A — Generate voiceover**

Reuse the existing voiceover and text-to-speech infrastructure, if available.

Support the selected language and appropriate pronunciation. Do not require a paid API when a compatible existing local option is available.

**Option B — Import voiceover**

Allow me to upload an audio file that corresponds to the selected script.

Support the existing audio formats.

Validate duration and playback, and warn me if the imported audio appears inconsistent with the chosen script.

Once the audio is ready:

- Align narration with script sentences when supported.
- Generate word- or sentence-level timestamps where practical.
- Keep the voiceover as the authoritative narration timeline.
- Preserve audio quality.
- Allow replacement without losing the approved script.

Do not fabricate successful voiceover generation if no compatible TTS engine is configured.

---

### 10. HAND OFF TO THE EXISTING MOVIE EXPLANATION WORKFLOW

This integration is mandatory.

After the script is approved and the voiceover is ready, automatically create a compatible project state for the existing movie explanation workflow.

Reuse the current modules for:

- Story Map & Intelligence
- Scene matching
- AI Director Timeline
- Visual shot selection
- Clip trimming
- Manual editing
- Preview playback
- Rendering and export

Pass the following data into the existing workflow:

- Original source video reference
- Original transcript reference
- Approved explanation script
- Selected language
- Voiceover audio reference
- Sentence-level narration timestamps
- Full scene index
- Story beat metadata
- Relevant scene candidate IDs
- Existing source timestamps
- Analysis cache identifiers

Do not create an isolated second renderer or duplicate the existing editing pipeline.

The handoff must use the same underlying timeline and rendering system as the current Movie & Series Explanation Studio.

---

### 11. USE SCENES FROM ACROSS THE ENTIRE MOVIE

The explanation video must use relevant visual material from across the complete source movie, from beginning to end, according to the selected narration.

Do not rely only on the first few minutes.

The scene-matching engine must:

- Map every narration segment to a suitable visual or flag it for review.
- Search the full indexed movie for relevant scenes.
- Respect chronological story order.
- Match the correct characters, actions, and events.
- Prioritize important story beats and the climax.
- Avoid repeatedly selecting the same few scenes.
- Avoid unrelated footage.
- Avoid missing sections of narration.
- Avoid black-screen filler.
- Avoid frozen frames caused by missing media.
- Maintain accurate source timestamps.

Use semantic matching, transcript context, visual descriptions, and confidence scoring.

If a suitable scene cannot be identified confidently, allow manual selection or recommend an original explanatory graphic.

Do not force an incorrect visual merely to fill a timeline gap.

---

### 12. STRICT THREE-SECOND MAXIMUM FOR MOVIE CLIPS

For this workflow, **no individual movie-footage clip on the generated timeline may exceed 3.0 seconds**.

Implement actual source in/out points and timeline duration validation.

Requirements:

- Automatically split longer source scenes into shorter shots.
- Keep every generated movie-footage segment at or below 3.0 seconds.
- Preserve accurate source timestamps.
- Use narration meaning and scene action to choose sensible cut points.
- Avoid accidental black frames, duplicate frames, and unintended gaps.
- Maintain story continuity while varying the selected source moments.
- Validate the rule before preview and export.
- Flag any clip that violates the rule instead of silently exporting it.

The 3-second restriction applies to individual movie-footage clips. It does not require every timeline element, caption, graphic, or screenshot to have the same duration.

This is an editing and pacing rule, not a guarantee against copyright claims.

---

### 13. INSERT OCCASIONAL SCREENSHOTS WITH MOTION

Provide an optional screenshot-based visual sequence in the generated explanation timeline.

Where appropriate, insert a screenshot after approximately 4–7 movie clips or at selected story beats.

A screenshot may remain visible for approximately 5–6 seconds and can use subtle movement such as:

- Slow left-to-right pan
- Slow right-to-left pan
- Gentle zoom-in
- Gentle zoom-out
- Subtle parallax where practical

Use the motion that best supports the narration.

Screenshots should add explanatory value rather than serve as arbitrary filler.

Use source timestamps and relevant scene references. Allow the user to inspect, replace, trim, or remove each screenshot.

Keep screenshot sequences visually consistent with the project style.

**Important rights requirement:** Do not present screenshots, motion effects, or alternating images as a way to evade copyright detection. Use screenshots only when the user has an appropriate legal basis to use the underlying material. Where rights are uncertain, suggest original graphics, licensed visuals, or user-owned images instead.

---

### 14. AUTOMATIC FIRST EDIT + MANUAL ADJUSTMENTS

The AI must generate the initial edit automatically, but I must retain full editing control.

Reuse and preserve existing editor capabilities, including:

- Pre-render playback
- Play and pause
- Timeline scrubbing
- Drag-and-drop clip replacement
- Clip trimming and splitting
- Manual zoom and position
- Crop and transform
- Per-clip speed controls
- Color correction and grading
- Filters and effects
- Clip and full-canvas borders
- Text overlays
- Synchronized captions and subtitles
- Undo and redo
- Timeline saving
- Export validation

Manual changes must update the actual project data used by preview and rendering.

AI regeneration must not silently overwrite manual edits.

---

### 15. CAPTIONS AND SUBTITLES

Generate captions from the selected narration script and align them to the actual voiceover.

Support:

- Sentence-level captions
- Word-level timing where practical
- Caption editing
- Split and merge
- Font, size, and color controls
- Outline and shadow
- Background boxes
- Caption positioning
- Caption templates
- SRT import and export
- Burned-in captions
- Subtitle-only export

If the script or audio changes, detect affected captions and offer realignment.

Keep caption timing independent of the movie source timestamps.

---

### 16. RIGHTS-AWARE PRE-EXPORT REVIEW

Before rendering, inspect the project's visual and audio asset metadata.

Show:

- Owned assets
- Properly licensed assets
- Assets with documented permission
- Assets with uncertain or missing rights information
- Restricted assets
- Timeline positions of flagged assets
- Attribution requirements, where applicable

Offer replacement with owned, licensed, or original visuals while preserving narration timing.

Do not implement Content ID evasion, fingerprint manipulation, misleading transformations, false rights metadata, or guaranteed copyright-safe claims.

Do not assume that original narration alone grants rights to the underlying movie footage.

The purpose is to help create original, rights-aware explanation videos, not to disguise copyrighted material.

---

### 17. CACHING, RECOVERY, AND PERFORMANCE

Long-movie analysis must be resumable.

Implement:

- Persistent project checkpoints
- Cached scene descriptions
- Cached transcript analysis
- Cached script versions
- Cached narration alignment
- Cached visual candidates
- Incremental scene rematching
- Safe resume after browser refresh
- Background job progress
- Cancellation and retry
- Error logging
- Temporary file cleanup

If only a script paragraph or one visual shot changes, do not reanalyze the entire movie.

Never delete original source files or final exports as part of routine cache cleanup.

Keep the UI responsive throughout processing.

---

### 18. DATA MODEL AND PROJECT PERSISTENCE

Inspect the existing project schema before adding new fields.

Persist:

- Uploaded file references
- Original transcript
- Analysis status
- Scene index
- Script versions in all three languages
- Approved script and selected language
- Voiceover references
- Narration alignment
- Timeline assignments
- Screenshot assignments
- Manual editing settings
- Caption data
- Render settings
- Processing checkpoints

Use safe migrations and preserve existing projects.

After browser refresh or application restart, the user must be able to reopen the project without losing completed analysis or approved scripts.

---

### 19. TESTS AND ACCEPTANCE CRITERIA

Test the entire feature using a short sample project before testing a full movie.

Verify that:

1. The new sidebar entry opens the correct workspace.
2. Both the video and TXT transcript are required and validated.
3. The complete source video is indexed.
4. The original transcript remains unchanged.
5. Qwen3:4b generates English, Hindi, and Bangla explanation scripts.
6. Each script targets 8–10 minutes of natural narration.
7. Each script begins with a compelling, factually grounded 10–20 second hook.
8. Script edits persist after refresh.
9. The user can choose a language before voiceover generation.
10. Voiceover generation or import works correctly.
11. The approved script and voiceover enter the existing movie explanation pipeline.
12. The scene matcher uses candidates from across the full movie.
13. Every generated movie clip respects the 3-second maximum.
14. Optional screenshot sequences use relevant scenes and configured motion effects.
15. Captions match the actual narration.
16. The full timeline can be previewed before final rendering.
17. Manual clip replacement affects both preview and export.
18. The latest timeline state is used for rendering.
19. Interrupted analysis can resume without repeating completed work.
20. Existing application features continue to work.

Report actual test results. Do not claim that an untested feature is complete.

---

### 20. IMPLEMENTATION INSTRUCTIONS

Work in this order:

**Phase 1:** Audit the repository, existing Ollama configuration, script generation, scene analysis, project storage, and rendering pipeline.

**Phase 2:** Implement the new sidebar workspace and upload validation.

**Phase 3:** Implement full-video indexing and original transcript analysis with caching and checkpoints.

**Phase 4:** Generate the three language scripts and build the review and selection interface.

**Phase 5:** Connect voiceover generation/import to the approved script.

**Phase 6:** Integrate the selected script and voiceover with the existing movie explanation workflow.

**Phase 7:** Enforce the 3-second clip limit and implement relevant screenshot-based visual sequences.

**Phase 8:** Test preview, editing, captions, rendering, recovery, and existing workflows.

After every phase, run available tests and resolve regressions before continuing.

### FINAL INSTRUCTION

Start by inspecting the existing codebase. Identify the modules that should be reused, the data model changes required, and the smallest safe implementation plan.

Then implement the new feature end to end.

**The final result must be a working addition to my current application: full movie + original TXT transcript → complete analysis → three engaging 8–10 minute scripts in English, Hindi, and Bangla → script review → voiceover → full-movie scene matching → maximum-three-second movie clips → optional moving screenshots → editable timeline → preview → final render.**






Preserve all existing features, reuse my two configured Ollama models, and prioritize accuracy, resumability, and performance on my existing hardware.