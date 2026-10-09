# BLACK BOOK GENERATION PHASES

## PHASE 1: Context Gathering & Codebase Ingestion
**Tasks for the Agent:**
1. Execute commands to list and read ALL files in the project directory (including source code, notebooks, datasets, and configuration files).
2. Analyze the `ARCHITECTURE.md` file to understand the system design.
3. Output a brief summary to the user detailing what you understand about the project's purpose, tech stack, and data flow. 
4. **Wait for user confirmation before proceeding to Phase 2.**

## PHASE 2: Front Matter Generation (Pages 1-6)
**Tasks for the Agent:**
1. Generate the **Cover Page**, **Certificate**, **Declaration**, and **Evaluation Certificate**. Leave placeholder brackets like `[Student Name]` or `[Guide Name]` where explicit data is not found in the directory.
2. Draft the **Acknowledgement** and **Preface** focusing on the intersection of Data Science/Business Analytics and the specific problem solved by this project.
3. **Wait for user review and edits before proceeding to Phase 3.**

## PHASE 3: Core Research & Methodology (Index i - iv)
**Tasks for the Agent:**
1. **Abstract:** Write a 250-word summary of the problem, methodology, and key results.
2. **Introduction:** Define the background, problem statement, objectives, and scope.
3. **Literature Review:** Based on the project domain, draft a review of existing methodologies and how this project bridges the gap.
4. **Research Methodology:** Detail the data collection, preprocessing steps, exploratory data analysis, and mathematical/algorithmic frameworks used.
5. **Wait for user review before proceeding to Phase 4.**

## PHASE 4: Implementation & Results (Index v - vii)
**Tasks for the Agent:**
1. **Implementation of Model/Design:** Translate `ARCHITECTURE.md` and the codebase into a detailed technical narrative. Include system requirements, model selection, hyperparameter tuning, and architectural diagrams (described in text).
2. **Data Interpretation & Presentation:** Analyze the output logs or data artifacts found in the directory. Create markdown tables for metrics (e.g., accuracy, precision, ROI).
3. **Conclusion:** Summarize the achievements, limitations of the current model, and future scope for enhancement.
4. **Wait for user review before proceeding to Phase 5.**

## PHASE 5: Finalization (Index viii & Last Page)
**Tasks for the Agent:**
1. **References:** Generate APA-style citations for any libraries, frameworks, or methodologies referenced in the text.
2. Generate the **Index** with appropriate section mapping.
3. Generate the **Last Page** as per standard university formatting.
4. Compile all phases into a single `BLACK_BOOK_FINAL.md` file.