# Public Announcements API

## Overview
This endpoint provides public access to thesis presentation announcements without requiring authentication. It supports date range filtering and multiple output formats.

## Endpoint
```
GET /api/public/announcements
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `start_date` | string | No | Start date for filtering (YYYY-MM-DD format) |
| `end_date` | string | No | End date for filtering (YYYY-MM-DD format) |
| `format` | string | No | Output format: `json` (default) or `xml` |

## Examples

### Get all announcements (JSON)
```bash
curl "http://localhost:3000/api/public/announcements"
```

### Get announcements with date range (JSON)
```bash
curl "http://localhost:3000/api/public/announcements?start_date=2024-01-01&end_date=2024-12-31"
```

### Get announcements in XML format
```bash
curl "http://localhost:3000/api/public/announcements?format=xml"
```

### Get announcements with date range in XML
```bash
curl "http://localhost:3000/api/public/announcements?start_date=2024-01-01&end_date=2024-12-31&format=xml"
```

## Response Format

### JSON Response
```json
{
  "total": 2,
  "announcements": [
    {
      "thesis_id": 1,
      "thesis_title": "Sample Thesis Title",
      "student": {
        "name": "John",
        "surname": "Doe",
        "student_number": "12345"
      },
      "supervisor": {
        "name": "Jane",
        "surname": "Smith"
      },
      "presentation": {
        "date": "2024-06-15T10:00:00.000Z",
        "mode": "δια ζώσης",
        "location_or_link": "Room 101",
        "announcement_text": "Presentation announcement text"
      },
      "created_at": "2024-06-01T09:00:00.000Z"
    }
  ]
}
```

### XML Response
```xml
<?xml version="1.0" encoding="UTF-8"?>
<announcements>
  <announcement>
    <thesis_id>1</thesis_id>
    <thesis_title><![CDATA[Sample Thesis Title]]></thesis_title>
    <student>
      <name>John</name>
      <surname>Doe</surname>
      <student_number>12345</student_number>
    </student>
    <supervisor>
      <name>Jane</name>
      <surname>Smith</surname>
    </supervisor>
    <presentation>
      <date>2024-06-15T10:00:00.000Z</date>
      <mode>δια ζώσης</mode>
      <location_or_link><![CDATA[Room 101]]></location_or_link>
      <announcement_text><![CDATA[Presentation announcement text]]></announcement_text>
    </presentation>
    <created_at>2024-06-01T09:00:00.000Z</created_at>
  </announcement>
</announcements>
```

## Notes

- Only theses with status "υπό εξέταση" (under examination) are included
- Only theses with presentation details are included
- Results are ordered by presentation date (ascending)
- Date filtering is inclusive
- The endpoint is publicly accessible (no authentication required)
- CDATA sections are used in XML for text content to handle special characters

## Error Responses

### 500 Internal Server Error
```json
{
  "error": "Σφάλμα διακομιστή κατά την ανάκτηση ανακοινώσεων."
}
```

## Use Cases

1. **Public Website Integration**: Display upcoming thesis presentations on a public website
2. **RSS Feed**: Use XML format for RSS feed generation
3. **Calendar Integration**: Import presentation dates into calendar applications
4. **Mobile Apps**: Provide data for mobile applications
5. **External Systems**: Allow other systems to consume announcement data 