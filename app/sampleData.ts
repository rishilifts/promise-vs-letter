// Recorded live API run on the synthetic example (regenerate after verified runs).
// Shown only under ?sample=1, always labeled as a recorded sample, never as a fresh result.
export const SAMPLE_LABEL = "Example result - synthetic recruiter chat and offer letter created for this demo. Not real documents.";

export const SAMPLE: any = {
  "conflicts": [
    {
      "field": "Fees / deposit",
      "fieldKey": "fees",
      "promised": "Stipend: Rs 15,000/month, no fees or deposit.",
      "stated": "A refundable security deposit of Rs 2,000 will be collected on joining.",
      "promiseQuote": "What the recruiter promised about Fees / deposit: \"Stipend: Rs 15,000/month, no fees or deposit.",
      "letterQuote": "What the formal offer letter states about Fees / deposit: \"A refundable security deposit of Rs 2,000 will be collected on joining.\"",
      "score": 0.9978,
      "promiseExact": true,
      "letterExact": true,
      "promiseGrounded": {
        "verdict": "supported",
        "supported": 0.9933
      },
      "letterGrounded": {
        "verdict": "supported",
        "supported": 0.9898
      }
    },
    {
      "field": "Salary / stipend",
      "fieldKey": "salary",
      "promised": "Stipend: Rs 15,000/month",
      "stated": "Stipend: Rs 9,000 per month during the training period of 6 months.",
      "promiseQuote": "What the recruiter promised about Salary / stipend: \"Stipend: Rs 15,000/month\"",
      "letterQuote": "What the formal offer letter states about Salary / stipend: \"Stipend: Rs 9,000 per month during the training period of 6 months.\"",
      "score": 0.9991,
      "promiseExact": true,
      "letterExact": true,
      "promiseGrounded": {
        "verdict": "supported",
        "supported": 0.9949
      },
      "letterGrounded": {
        "verdict": "supported",
        "supported": 0.984
      }
    },
    {
      "field": "Training / probation",
      "fieldKey": "training",
      "promised": "3 months training, then permanent role.",
      "stated": "Stipend: Rs 9,000 per month during the training period of 6 months.",
      "promiseQuote": "What the recruiter promised about Training / probation: \"3 months training, then permanent role.",
      "letterQuote": "What the formal offer letter states about Training / probation: \"Stipend: Rs 9,000 per month during the training period of 6 months.\"",
      "score": 0.9991,
      "promiseExact": true,
      "letterExact": true,
      "promiseGrounded": {
        "verdict": "supported",
        "supported": 0.9944
      },
      "letterGrounded": {
        "verdict": "supported",
        "supported": 0.9887
      }
    },
    {
      "field": "Work location",
      "fieldKey": "location",
      "promised": "Joining: 5 Jan 2026, Bengaluru office.",
      "stated": "Date of joining: 1 February 2026, Hyderabad office.",
      "promiseQuote": "What the recruiter promised about Work location: \"Joining: 5 Jan 2026, Bengaluru office.",
      "letterQuote": "What the formal offer letter states about Work location: \"Date of joining: 1 February 2026, Hyderabad office.\"",
      "score": 0.9781,
      "promiseExact": true,
      "letterExact": true,
      "promiseGrounded": {
        "verdict": "supported",
        "supported": 0.9934
      },
      "letterGrounded": {
        "verdict": "supported",
        "supported": 0.985
      }
    },
    {
      "field": "Joining date",
      "fieldKey": "joining_date",
      "promised": "Joining: 5 Jan 2026, Bengaluru office.",
      "stated": "Date of joining: 1 February 2026, Hyderabad office.",
      "promiseQuote": "What the recruiter promised about Joining date: \"Joining: 5 Jan 2026, Bengaluru office.",
      "letterQuote": "What the formal offer letter states about Joining date: \"Date of joining: 1 February 2026, Hyderabad office.\"",
      "score": 0.9781,
      "promiseExact": true,
      "letterExact": true,
      "promiseGrounded": {
        "verdict": "supported",
        "supported": 0.9943
      },
      "letterGrounded": {
        "verdict": "supported",
        "supported": 0.9852
      }
    },
    {
      "field": "Role / title",
      "fieldKey": "role",
      "promised": "selected for Junior Analyst.",
      "stated": "We are pleased to offer you the position of Support Associate at TechNova Solutions.",
      "promiseQuote": "What the recruiter promised about Role / title: \"selected for Junior Analyst.",
      "letterQuote": "What the formal offer letter states about Role / title: \"We are pleased to offer you the position of Support Associate at TechNova Solutions.\"",
      "score": 0.9623,
      "promiseExact": true,
      "letterExact": true,
      "promiseGrounded": {
        "verdict": "supported",
        "supported": 0.9942
      },
      "letterGrounded": {
        "verdict": "supported",
        "supported": 0.9887
      }
    }
  ],
  "overflowConflicts": 0,
  "notInLetter": [],
  "newInLetter": [
    {
      "field": "Notice period",
      "stated": "Notice period: 3 months from either side."
    }
  ],
  "agreed": [],
  "report": "Promise vs Letter - conflict report\n\n1. Fees / deposit: promised \"Stipend: Rs 15,000/month, no fees or deposit.\" - letter states \"A refundable security deposit of Rs 2,000 will be collected on joining.\".\n2. Salary / stipend: promised \"Stipend: Rs 15,000/month\" - letter states \"Stipend: Rs 9,000 per month during the training period of 6 months.\".\n3. Training / probation: promised \"3 months training, then permanent role.\" - letter states \"Stipend: Rs 9,000 per month during the training period of 6 months.\".\n4. Work location: promised \"Joining: 5 Jan 2026, Bengaluru office.\" - letter states \"Date of joining: 1 February 2026, Hyderabad office.\".\n5. Joining date: promised \"Joining: 5 Jan 2026, Bengaluru office.\" - letter states \"Date of joining: 1 February 2026, Hyderabad office.\".\n6. Role / title: promised \"selected for Junior Analyst.\" - letter states \"We are pleased to offer you the position of Support Associate at TechNova Solutions.\".\n- New in the letter: Notice period (\"Notice period: 3 months from either side.\") appears only in the letter.\n\nDetected items only - a 'not detected' result does not prove a term is fair or absent. Review the original documents.",
  "maskedReport": "Promise vs Letter - conflict report\n\n1. Fees / deposit: promised \"Stipend: Rs 15,000/month, no fees or deposit.\" - letter states \"A refundable security deposit of Rs 2,000 will be collected on joining.\".\n2. Salary / stipend: promised \"Stipend: Rs 15,000/month\" - letter states \"Stipend: Rs 9,000 per month during the training period of 6 months.\".\n3. Training / probation: promised \"3 months training, then permanent role.\" - letter states \"Stipend: Rs 9,000 per month during the training period of 6 months.\".\n4. Work location: promised \"Joining: 5 Jan 2026, Bengaluru office.\" - letter states \"Date of joining: 1 February 2026, Hyderabad office.\".\n5. Joining date: promised \"Joining: 5 Jan 2026, Bengaluru office.\" - letter states \"Date of joining: 1 February 2026, Hyderabad office.\".\n6. Role / title: promised \"selected for Junior Analyst.\" - letter states \"We are pleased to offer you the position of Support Associate at TechNova Solutions.\".\n- New in the letter: Notice period (\"Notice period: 3 months from either side.\") appears only in the letter.\n\nDetected items only - a 'not detected' result does not prove a term is fair or absent. Review the original documents.",
  "maskedEntities": {},
  "creditsUsed": null
};
