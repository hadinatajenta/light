# UML

Design diagrams for the `light` system, written as Mermaid so they live in
version control and render directly on GitHub.

## Why Mermaid

Mermaid is plain text. A diagram can be reviewed in a pull request, diffed,
and updated in the same commit as the code it describes. Image-based UML
tools produce binary files that nobody reviews.

## Categories

| Folder | UML diagram | Answers |
| --- | --- | --- |
| `use-case/` | Use case | Who uses the system and what they can do |
| `component/` | Component | What the system is made of and how parts talk |
| `class/` | Class / domain model | What the data looks like and how it relates |
| `sequence/` | Sequence | How a specific operation flows over time |
| `activity/` | Activity | The steps and decisions in a workflow |
| `state/` | State machine | The lifecycle of a single entity |
| `deployment/` | Deployment | Where the system runs in production |

## Index

- [CMS use cases](use-case/cms-use-cases.md)
- [Component diagram](component/cms-components.md)
- [Domain model](class/domain-model.md)
- [Publish a post](sequence/publish-post.md)
- [Upload media](sequence/upload-media.md)
- [Agent batch publish](sequence/agent-batch-publish.md)
- [Publish workflow](activity/publish-workflow.md)
- [Post lifecycle](state/post-lifecycle.md)
- [Production deployment](deployment/production.md)

## Scope

The diagrams describe the target system: the public static site, the
authenticated dashboard, the content and media stores, and the automated
content pipeline. Where a decision is still open, the diagram notes the
alternative inline.
