# State: post lifecycle

The states a single post moves through.

```mermaid
stateDiagram-v2
  [*] --> draft
  draft --> in_review : submit
  in_review --> draft : needs work
  in_review --> scheduled : approved with a date
  in_review --> published : approved to publish now
  scheduled --> published : publish time reached
  published --> draft : unpublish
  published --> archived : retire
  archived --> published : restore
  archived --> [*]
```

## Transition rules

| From | To | Who | Condition |
| --- | --- | --- | --- |
| draft | in_review | Admin or agent | Validation passes |
| in_review | draft | Admin or QA gate | Rejected with reasons |
| in_review | published | Admin | Approved, no schedule |
| in_review | scheduled | Admin | Approved with a future date |
| scheduled | published | Scheduler | Publish time reached, validation still passes |
| published | draft | Admin | Unpublish |
| published | archived | Admin | Retire old content |
| archived | published | Admin | Restore |

Only `published` is visible on the public site. `scheduled` becomes published
by a scheduled job, not by a client request.
