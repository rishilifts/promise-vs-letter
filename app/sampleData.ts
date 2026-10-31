export const SAMPLE_LABEL = "Example result - synthetic recruiter chat and offer letter created for this demo. Not real documents.";

// Recorded live API run on the synthetic example (regenerate after verified runs).
// Shown only under ?sample=1, always labeled as a recorded sample, never as a fresh result.
export const SAMPLE: any = {
  "conflicts": [
    {
      "field": "Salary / stipend",
      "fieldKey": "salary",
      "promised": "Rs 15,000/month",
      "stated": "Rs 9,000 per month",
      "promiseQuote": "What the recruiter promised about Salary / stipend: \"Rs 15,000/month\"",
      "letterQuote": "What the formal offer letter states about Salary / stipend: \"Rs 9,000 per month\"",
      "score": 0.9992,
      "promiseGrounded": {
        "verdict": "supported",
        "supported": 0.9953
      },
      "letterGrounded": {
        "verdict": "supported",
        "supported": 0.993
      }
    },
    {
      "field": "Fees / deposit",
      "fieldKey": "fees",
      "promised": "no fees or deposit",
      "stated": "Rs 2,000",
      "promiseQuote": "What the recruiter promised about Fees / deposit: \"no fees or deposit\"",
      "letterQuote": "What the formal offer letter states about Fees / deposit: \"Rs 2,000\"",
      "score": 0.9985,
      "promiseGrounded": {
        "verdict": "supported",
        "supported": 0.9954
      },
      "letterGrounded": {
        "verdict": "supported",
        "supported": 0.9932
      }
    },
    {
      "field": "Training / probation",
      "fieldKey": "training",
      "promised": "3 months training, then permanent role",
      "stated": "training period of 6 months",
      "promiseQuote": "What the recruiter promised about Training / probation: \"3 months training, then permanent role\"",
      "letterQuote": "What the formal offer letter states about Training / probation: \"training period of 6 months\"",
      "score": 0.9991,
      "promiseGrounded": {
        "verdict": "supported",
        "supported": 0.9953
      },
      "letterGrounded": {
        "verdict": "supported",
        "supported": 0.9943
      }
    },
    {
      "field": "Work location",
      "fieldKey": "location",
      "promised": "Bengaluru",
      "stated": "Hyderabad",
      "promiseQuote": "What the recruiter promised about Work location: \"Bengaluru\"",
      "letterQuote": "What the formal offer letter states about Work location: \"Hyderabad\"",
      "score": 0.999,
      "promiseGrounded": {
        "verdict": "supported",
        "supported": 0.9956
      },
      "letterGrounded": {
        "verdict": "supported",
        "supported": 0.9942
      }
    },
    {
      "field": "Joining date",
      "fieldKey": "joining_date",
      "promised": "5 Jan 2026",
      "stated": "1 February 2026",
      "promiseQuote": "What the recruiter promised about Joining date: \"5 Jan 2026\"",
      "letterQuote": "What the formal offer letter states about Joining date: \"1 February 2026\"",
      "score": 0.999,
      "promiseGrounded": {
        "verdict": "supported",
        "supported": 0.9946
      },
      "letterGrounded": {
        "verdict": "supported",
        "supported": 0.9929
      }
    },
    {
      "field": "Role / title",
      "fieldKey": "role",
      "promised": "Junior Analyst",
      "stated": "Support Associate",
      "promiseQuote": "What the recruiter promised about Role / title: \"Junior Analyst\"",
      "letterQuote": "What the formal offer letter states about Role / title: \"Support Associate\"",
      "score": 0.9467,
      "promiseGrounded": {
        "verdict": "supported",
        "supported": 0.9954
      },
      "letterGrounded": {
        "verdict": "supported",
        "supported": 0.9938
      }
    }
  ],
  "overflowConflicts": 0,
  "notInLetter": [],
  "newInLetter": [
    {
      "field": "Notice period",
      "stated": "3 months from either side"
    }
  ],
  "agreed": [],
  "report": "Promise vs Letter - conflict report\n\n1. Salary / stipend: promised \"Rs 15,000/month\" - letter states \"Rs 9,000 per month\".\n2. Fees / deposit: promised \"no fees or deposit\" - letter states \"Rs 2,000\".\n3. Training / probation: promised \"3 months training, then permanent role\" - letter states \"training period of 6 months\".\n4. Work location: promised \"Bengaluru\" - letter states \"Hyderabad\".\n5. Joining date: promised \"5 Jan 2026\" - letter states \"1 February 2026\".\n6. Role / title: promised \"Junior Analyst\" - letter states \"Support Associate\".\n- New in the letter: Notice period (\"3 months from either side\") appears only in the letter.\n\nDetected items only - a 'not detected' result does not prove a term is fair or absent. Review the original documents.",
  "maskedReport": "Promise vs Letter - conflict report\n\n1. Salary / stipend: promised \"Rs 15,000/month\" - letter states \"Rs 9,000 per month\".\n2. Fees / deposit: promised \"no fees or deposit\" - letter states \"Rs 2,000\".\n3. Training / probation: promised \"3 months training, then permanent role\" - letter states \"training period of 6 months\".\n4. Work location: promised \"Bengaluru\" - letter states \"Hyderabad\".\n5. Joining date: promised \"5 Jan 2026\" - letter states \"1 February 2026\".\n6. Role / title: promised \"Junior Analyst\" - letter states \"Support Associate\".\n- New in the letter: Notice period (\"3 months from either side\") appears only in the letter.\n\nDetected items only - a 'not detected' result does not prove a term is fair or absent. Review the original documents.",
  "maskedEntities": {},
  "creditsUsed": null
};
