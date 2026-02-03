#!/usr/bin/env python3
"""
Export Linear projects from local IndexedDB cache to JSON.

Reads from Linear Desktop App's IndexedDB and exports project data
with recent issue titles for Cloudflare KV sync.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from typing import Any, Optional

LINEAR_MCP_FAST_VENDOR_CCL = "/Users/wine_ny/side-project/linear-mcp-fast/vendor/ccl_chromium_reader"
LINEAR_MCP_FAST_VENDOR_SNAPPY = "/Users/wine_ny/side-project/linear-mcp-fast/vendor/ccl_simplesnappy"
LINEAR_DB_PATH = os.path.expanduser(
    "~/Library/Application Support/Linear/IndexedDB/https_linear.app_0.indexeddb.leveldb"
)
LINEAR_BLOB_PATH = os.path.expanduser(
    "~/Library/Application Support/Linear/IndexedDB/https_linear.app_0.indexeddb.blob"
)


def setup_pythonpath() -> None:
    for path in [LINEAR_MCP_FAST_VENDOR_CCL, LINEAR_MCP_FAST_VENDOR_SNAPPY]:
        if path not in sys.path:
            sys.path.insert(0, path)


def is_project_record(record: dict[str, Any]) -> bool:
    """Check if a record looks like a Linear project (updated detection)."""
    required = {"name", "teamIds", "statusId", "organizationId"}
    if not required.issubset(record.keys()):
        return False
    team_ids = record.get("teamIds")
    return isinstance(team_ids, list)


def is_team_record(record: dict[str, Any]) -> bool:
    if not {"key", "name"}.issubset(record.keys()):
        return False
    key = record.get("key")
    if not isinstance(key, str):
        return False
    return key.isupper() and key.isalpha() and len(key) <= 10


def is_issue_record(record: dict[str, Any]) -> bool:
    required = {"number", "teamId", "title"}
    return required.issubset(record.keys())


def is_workflow_state_record(record: dict[str, Any]) -> bool:
    if not {"name", "type", "color", "teamId"}.issubset(record.keys()):
        return False
    state_type = record.get("type")
    valid_types = {"started", "unstarted", "completed", "canceled", "backlog"}
    return state_type in valid_types


def is_project_status_record(record: dict[str, Any]) -> bool:
    """Project status has type but no teamId (workflow states have teamId)."""
    required = {"name", "color", "position", "type", "organizationId"}
    if not required.issubset(record.keys()):
        return False
    if "teamId" in record:
        return False
    record_type = record.get("type")
    return record_type in {"started", "planned", "paused", "completed", "canceled", "backlog"}


def load_linear_data() -> tuple[dict, dict, dict, dict, dict]:
    """
    Load projects, teams, issues, workflow states, and project statuses from Linear IndexedDB.
    
    Returns: (projects, teams, issues, states, project_statuses)
    """
    setup_pythonpath()
    from ccl_chromium_reader import ccl_chromium_indexeddb  # type: ignore
    
    if not os.path.exists(LINEAR_DB_PATH):
        raise FileNotFoundError(f"Linear database not found at {LINEAR_DB_PATH}")
    
    wrapper = ccl_chromium_indexeddb.WrappedIndexDB(LINEAR_DB_PATH, LINEAR_BLOB_PATH)
    
    db = None
    for db_id in wrapper.database_ids:
        if "linear_" in db_id.name and db_id.name != "linear_databases":
            candidate = wrapper[db_id.name, db_id.origin]
            if list(candidate.object_store_names):
                db = candidate
                break
    
    if not db:
        raise ValueError("Could not find Linear database in IndexedDB")
    
    projects: dict[str, dict] = {}
    teams: dict[str, dict] = {}
    issues: dict[str, dict] = {}
    states: dict[str, dict] = {}
    project_statuses: dict[str, dict] = {}
    
    for store_name in db.object_store_names:
        if store_name is None or store_name.startswith('_') or "_partial" in store_name:
            continue
        
        try:
            store = db[store_name]
            first_record = None
            
            for record in store.iterate_records():
                val = record.value
                if not isinstance(val, dict):
                    break
                first_record = val
                break
            
            if not first_record:
                continue
            
            if is_project_record(first_record):
                for record in store.iterate_records():
                    if isinstance(record.value, dict) and record.value.get("id"):
                        projects[record.value["id"]] = record.value
            elif is_team_record(first_record):
                for record in store.iterate_records():
                    if isinstance(record.value, dict) and record.value.get("id"):
                        teams[record.value["id"]] = record.value
            elif is_issue_record(first_record):
                for record in store.iterate_records():
                    if isinstance(record.value, dict) and record.value.get("id"):
                        issues[record.value["id"]] = record.value
            elif is_workflow_state_record(first_record):
                for record in store.iterate_records():
                    if isinstance(record.value, dict) and record.value.get("id"):
                        states[record.value["id"]] = record.value
            elif is_project_status_record(first_record):
                for record in store.iterate_records():
                    if isinstance(record.value, dict) and record.value.get("id"):
                        project_statuses[record.value["id"]] = record.value
                        
        except Exception:
            continue
    
    return projects, teams, issues, states, project_statuses


def extract_keywords(name: str, description: Optional[str]) -> list[str]:
    """
    Tokenize name+description, filter stopwords, dedupe, return max 10 keywords.
    
    Based on plan rules: 2+ char tokens, Korean/English stopwords removed.
    """
    text = f"{name} {description or ''}"
    tokens = re.split(r'[\s\[\]\(\)\/\-_,.:;!?@#$%^&*]+', text.lower())
    stopwords = {
        '의', '및', '을', '를', '이', '가', '에', '로', '은', '는', '와', '과',
        'a', 'the', 'is', 'to', 'for', 'and', 'or', 'of', 'in', 'on', 'at', 'by'
    }
    keywords = [t for t in tokens if len(t) >= 2 and t not in stopwords]
    seen: set[str] = set()
    unique: list[str] = []
    for kw in keywords:
        if kw not in seen:
            seen.add(kw)
            unique.append(kw)
    return unique[:10]


def get_team_info(project: dict[str, Any], teams: dict[str, Any]) -> tuple[str, str]:
    """Return (teamId, teamName) using first entry from teamIds array."""
    team_ids = project.get("teamIds", [])
    if not team_ids:
        return "", "Unknown"
    
    team_id = team_ids[0]
    team = teams.get(team_id, {})
    team_name = team.get("name", "Unknown")
    return team_id, team_name


def get_project_state(project: dict[str, Any], project_statuses: dict[str, Any]) -> str:
    """Get project state name (started/planned/etc) from statusId."""
    status_id = project.get("statusId")
    if not status_id:
        return ""
    status = project_statuses.get(status_id, {})
    return status.get("type", "")


def get_recent_issues(
    project_id: str,
    issues: dict[str, Any],
    states: dict[str, Any]
) -> list[str]:
    """
    Get top 10 recent non-completed/canceled issue titles for a project.
    
    Sorted by updatedAt descending. Includes issues without stateId (conservative).
    """
    def is_active(issue: dict[str, Any]) -> bool:
        state_id = issue.get("stateId")
        if not state_id:
            return True
        state = states.get(state_id, {})
        state_type = state.get("type", "")
        return state_type not in ("completed", "canceled")
    
    project_issues = [
        issue for issue in issues.values()
        if issue.get("projectId") == project_id 
        and is_active(issue)
        and issue.get("title")
    ]
    
    sorted_issues = sorted(
        project_issues,
        key=lambda x: x.get("updatedAt", ""),
        reverse=True
    )
    
    return [issue["title"] for issue in sorted_issues[:10]]


def export_projects(output_path: Optional[str] = None) -> dict[str, Any]:
    """Export started/planned projects to ProjectCache-compatible JSON."""
    projects_raw, teams, issues, states, project_statuses = load_linear_data()
    
    print(f"Loaded: {len(projects_raw)} projects, {len(teams)} teams, {len(issues)} issues", file=sys.stderr)
    
    active_states = {"started", "planned"}
    
    cached_projects = []
    for project_id, project in projects_raw.items():
        state = get_project_state(project, project_statuses)
        if state not in active_states:
            continue
        
        team_id, team_name = get_team_info(project, teams)
        name = project.get("name", "")
        description = project.get("description")
        keywords = extract_keywords(name, description)
        recent_issues = get_recent_issues(project_id, issues, states)
        
        content = project.get("content") or ""
        
        cached_projects.append({
            "id": project_id,
            "name": name,
            "description": description or "",
            "content": content[:400] if content else "",
            "teamId": team_id,
            "teamName": team_name,
            "state": state,
            "keywords": keywords,
            "recentIssueTitles": recent_issues
        })
    
    result = {
        "version": 2,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "projects": cached_projects
    }
    
    if output_path:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"Exported {len(cached_projects)} projects to {output_path}", file=sys.stderr)
    
    return result


def main():
    parser = argparse.ArgumentParser(description="Export Linear projects from local cache")
    parser.add_argument("--output", "-o", help="Output JSON file path")
    args = parser.parse_args()
    
    try:
        result = export_projects(args.output)
        if not args.output:
            print(json.dumps(result, ensure_ascii=False, indent=2))
    except FileNotFoundError as e:
        print(f"Error: Linear app cache not found. Is Linear Desktop running?", file=sys.stderr)
        print(f"Details: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
