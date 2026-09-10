\# Execution Protocol: Ultra-Low Request Optimization



Every tool call and turn incurs an extreme per-request API cost. Minimize total round-trips with zero back-and-forth.



\### 1. Batch Everything

\- Never perform single-step inspections. Batch file reads, directory scans, and grep searches in parallel or single commands.

\- Plan the complete implementation internally before taking action. Execute all edits, script runs, and builds in a single turn whenever possible.



\### 2. Zero Exploration Overhead

\- Inspect only the exact lines/files necessary. Avoid broad directory crawls.

\- Combine shell checks into chained commands (e.g., `git status \&\& npm run build \&\& npm test`) rather than evaluating step-by-step.



\### 3. No Unnecessary Turns

\- Do not stop to ask for confirmation or provide intermediate conversational updates.

\- Complete the full task from diagnosis to implementation and validation before returning your final response.

