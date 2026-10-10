# Domain model

The entities the system persists and their relationships.

```mermaid
classDiagram
  class Post {
    +string id
    +string title
    +string slug
    +string description
    +string body
    +PostStatus status
    +Date publishedAt
    +Date updatedAt
    +string coverMediaId
    +string[] tagSlugs
    +boolean affiliate
    +boolean noindex
  }

  class Page {
    +string id
    +string title
    +string slug
    +string body
    +boolean noindex
    +Date updatedAt
  }

  class Category {
    +string slug
    +string label
    +string description
  }

  class Media {
    +string id
    +string key
    +string url
    +string alt
    +string mime
    +int width
    +int height
    +int bytes
    +Date createdAt
  }

  class Redirect {
    +string from
    +string to
    +int statusCode
  }

  class AffiliateProgram {
    +string id
    +string name
    +string network
    +string disclosure
  }

  class Settings {
    +string siteTitle
    +string siteDescription
    +string analyticsId
    +string adsenseClientId
  }

  class User {
    +string email
    +string name
    +UserRole role
  }

  class PostStatus {
    <<enumeration>>
    draft
    in_review
    scheduled
    published
    archived
  }

  class UserRole {
    <<enumeration>>
    admin
    editor
  }

  Post "*" --> "*" Category : tagged
  Post --> "0..1" Media : cover
  Post "*" --> "1" User : author
  Page --> "0..1" User : editor
  Settings --> "0..1" Media : defaultOgImage
```

## Field rules

- `slug` is unique across `Post` and `Page`, and is the URL identity. Changing
  it requires a matching `Redirect` from the old path.
- `Media.alt` is required for any image referenced as a cover.
- `Post.status` drives visibility; only `published` appears on the public site.
- `User.email` is the identity key, so a future custom login can be reconciled
  with Cloudflare Access by matching email.
- `Settings` is a singleton.
