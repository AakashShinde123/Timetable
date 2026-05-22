"""
Constraint enforcement engine for the timetable.

A rule has:
    conditions: list of {field, op, value}   -- matching predicate
    action:     {type, value}                -- forbid | require | prefer | limit
    severity:   'hard' | 'soft'

Cell context fields supported:
    teacher   -- teacher abbreviation
    subject   -- subject name (canonical)
    class     -- class.grade (e.g. "Grade 6")
    day       -- "Mon".."Sat"
    period    -- period.name (e.g. "P1")

Action value patterns understood:
    "period ∈ P1,P2"            -> field op value triplet
    "period ∉ P1,P2"
    "day ∈ Wed,Thu"
    "consecutive"               -> handled separately
    "simultaneous_classes"      -> handled separately
    "max_2_per_class_per_day"   -> handled separately
    "5 ≤ daily_periods ≤ 7"     -> handled separately
    "break_after_3"             -> handled separately
"""
import re
from typing import Dict, List, Any, Optional


def _split_list(v: str) -> List[str]:
    return [x.strip() for x in str(v).split(',') if x.strip()]


def _match_predicate(field: str, op: str, value: str, ctx: Dict[str, Any]) -> bool:
    """Return True if cell context satisfies the predicate."""
    actual = str(ctx.get(field, '') or '').strip()
    values = _split_list(value)
    if op == '=':
        return actual == value.strip() or actual in values
    if op == '≠':
        return actual != value.strip() and actual not in values
    if op == '∈':
        return actual in values
    if op == '∉':
        return actual not in values
    if op in ('>', '<', '≥', '≤'):
        try:
            a = float(actual); b = float(value)
            return {'>': a > b, '<': a < b, '≥': a >= b, '≤': a <= b}[op]
        except Exception:
            return False
    return False


def _parse_action_value(s: str) -> Optional[Dict[str, str]]:
    """Parse 'field op value1,value2' style action value."""
    if not s:
        return None
    s = s.strip()
    m = re.match(r'(\w+)\s*(∈|∉|=|≠|>|<|≥|≤)\s*(.+)', s)
    if m:
        return {'field': m.group(1).lower(), 'op': m.group(2), 'value': m.group(3).strip()}
    return {'raw': s}


def evaluate_cell(rules: List[Dict[str, Any]], cell_ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Evaluate all rules for a single cell context. Returns list of violations."""
    violations = []
    for rule in rules:
        if not rule.get('enabled', True):
            continue
        # Step 1: all conditions must match for the rule to apply
        conditions = rule.get('conditions') or []
        if conditions:
            applies = all(
                _match_predicate(c.get('field', ''), c.get('op', '='), c.get('value', ''), cell_ctx)
                for c in conditions
            )
            if not applies:
                continue
        # Step 2: evaluate action
        action = rule.get('action') or {}
        a_type = (action.get('type') or '').lower()
        a_value = action.get('value') or ''
        parsed = _parse_action_value(a_value)

        violated = False
        msg = None

        if a_type == 'forbid' and parsed and 'field' in parsed:
            if _match_predicate(parsed['field'], parsed['op'], parsed['value'], cell_ctx):
                violated = True
                msg = f"{parsed['field']} should not be {parsed['op']} {parsed['value']}"
        elif a_type == 'require' and parsed and 'field' in parsed:
            if not _match_predicate(parsed['field'], parsed['op'], parsed['value'], cell_ctx):
                violated = True
                msg = f"{parsed['field']} must be {parsed['op']} {parsed['value']}"
        elif a_type == 'prefer' and parsed and 'field' in parsed:
            if not _match_predicate(parsed['field'], parsed['op'], parsed['value'], cell_ctx):
                violated = True
                msg = f"prefer {parsed['field']} {parsed['op']} {parsed['value']}"

        if violated:
            violations.append({
                'rule_id': rule.get('id'),
                'rule_name': rule.get('name'),
                'severity': rule.get('severity', 'hard'),
                'message': msg,
            })

    return violations


def evaluate_workload(rules, school_cells, cell_ctx, teacher_id, class_id, day):
    """Workload-style cross-cell checks: max 2 same class/day, daily range."""
    issues = []
    if not teacher_id:
        return issues
    same_day_same_class = sum(
        1 for c in school_cells
        if c.get('teacher_id') == teacher_id and c.get('class_id') == class_id and c.get('day') == day
    )
    if same_day_same_class > 2:
        issues.append({
            'rule_name': 'Teacher max 2 periods in same class/day',
            'severity': 'hard',
            'message': f'Teacher already has {same_day_same_class} periods in this class today',
        })
    same_day_total = sum(
        1 for c in school_cells
        if c.get('teacher_id') == teacher_id and c.get('day') == day
    )
    if same_day_total > 7:
        issues.append({
            'rule_name': 'Teacher daily period range',
            'severity': 'hard',
            'message': f'Teacher exceeds 7 periods on {day} ({same_day_total})',
        })
    return issues


def evaluate_consecutive(rules, cells, subjects_by_id, classes_by_id, periods_by_id):
    """Check 'consecutive' action rules across the timetable.
    For each rule with action.value containing 'consecutive', for each class+subject+day,
    verify that the periods are consecutive (by order)."""
    violations = []
    consec_rules = [r for r in rules if r.get('enabled', True)
                    and 'consecutive' in str(r.get('action', {}).get('value', '')).lower()]
    if not consec_rules:
        return violations
    # Group cells by (class_id, subject_id, day)
    groups = {}
    for c in cells:
        if c.get('subject_id'):
            key = (c['class_id'], c['subject_id'], c['day'])
            groups.setdefault(key, []).append(c)
    for rule in consec_rules:
        for (class_id, subject_id, day), gcells in groups.items():
            if len(gcells) < 2:
                continue
            sub = subjects_by_id.get(subject_id)
            cls = classes_by_id.get(class_id)
            if not sub or not cls:
                continue
            if not _ctx_matches_rule(rule, {
                'subject': sub.get('name', ''),
                'class': (cls.get('standard') or cls.get('grade', '')),
            }):
                continue
            orders = sorted([periods_by_id.get(c['period_id'], {}).get('order', 0) for c in gcells])
            # Need at least one consecutive run
            is_consec = any(orders[i + 1] - orders[i] == 1 for i in range(len(orders) - 1))
            if not is_consec:
                violations.append({
                    'rule_name': rule.get('name'),
                    'severity': rule.get('severity', 'soft'),
                    'message': f"{sub.get('name')} in {cls.get('name')} on {day} not scheduled consecutively",
                    'class_id': class_id, 'day': day, 'subject_id': subject_id,
                })
    return violations


def evaluate_simultaneous(rules, cells, subjects_by_id):
    """For rules with action.value 'simultaneous_classes', forbid same subject in same day+period across classes."""
    violations = []
    sim_rules = [r for r in rules if r.get('enabled', True)
                 and 'simultaneous' in str(r.get('action', {}).get('value', '')).lower()]
    if not sim_rules:
        return violations
    for rule in sim_rules:
        # Determine which subject(s) the rule applies to
        targets = set()
        for cond in rule.get('conditions', []):
            if cond.get('field') == 'subject':
                for v in str(cond.get('value', '')).split(','):
                    targets.add(v.strip())
        if not targets:
            continue
        # Bucket cells by (day, period_id, subject_id)
        bucket = {}
        for c in cells:
            sub = subjects_by_id.get(c.get('subject_id'))
            if not sub or sub.get('name') not in targets:
                continue
            key = (c['day'], c['period_id'], sub['name'])
            bucket.setdefault(key, []).append(c)
        for (day, period_id, sub_name), gcells in bucket.items():
            if len(gcells) > 1:
                classes = sorted({c['class_id'] for c in gcells})
                violations.append({
                    'rule_name': rule.get('name'),
                    'severity': rule.get('severity', 'hard'),
                    'message': f"{sub_name} scheduled simultaneously in {len(classes)} classes at {day} {period_id}",
                    'day': day, 'period_id': period_id, 'classes': classes,
                })
    return violations


def evaluate_clubbed_by_grade(rules, cells, subjects_by_id, classes_by_id):
    """For rules with action.value 'clubbed_by_grade', all divisions of same grade should
    have the subject at the same day+period."""
    violations = []
    club_rules = [r for r in rules if r.get('enabled', True)
                  and 'clubbed_by_grade' in str(r.get('action', {}).get('value', '')).lower()]
    if not club_rules:
        return violations
    for rule in club_rules:
        targets = set()
        for cond in rule.get('conditions', []):
            if cond.get('field') == 'subject':
                for v in str(cond.get('value', '')).split(','):
                    targets.add(v.strip())
        if not targets:
            continue
        # Group cells by (grade, subject) -> list of (day, period_id, class_id)
        grouped = {}
        for c in cells:
            sub = subjects_by_id.get(c.get('subject_id'))
            cls = classes_by_id.get(c.get('class_id'))
            if not sub or not cls or sub.get('name') not in targets:
                continue
            key = (cls.get('standard') or cls.get('grade'), sub.get('name'))
            grouped.setdefault(key, []).append((c['day'], c['period_id'], c['class_id']))
        for (grade, sub_name), entries in grouped.items():
            slots = {(d, p) for d, p, _ in entries}
            classes_in_grade = {cid for cid, c in classes_by_id.items() if (c.get('standard') or c.get('grade')) == grade}
            for (d, p) in slots:
                here = {cid for dd, pp, cid in entries if dd == d and pp == p}
                missing = classes_in_grade - here
                if missing:
                    violations.append({
                        'rule_name': rule.get('name'),
                        'severity': rule.get('severity', 'hard'),
                        'message': f"{sub_name} at {d} {p}: missing {len(missing)} of {len(classes_in_grade)} {grade} sections",
                        'day': d, 'period_id': p, 'grade': grade,
                    })
    return violations


def _subject_filter(rule, subjects_by_id, classes_by_id):
    """Stub used to avoid import cycles."""
    return None


def _ctx_matches_rule(rule, ctx):
    """Re-run rule conditions against a partial cell ctx (only fields that matter for filtering)."""
    for cond in rule.get('conditions', []):
        f = cond.get('field', '')
        if f not in ctx:
            continue
        if not _match_predicate(f, cond.get('op', '='), cond.get('value', ''), ctx):
            return False
    return True


def audit_timetable(rules, cells, teachers_by_id, subjects_by_id, classes_by_id, periods_by_id):
    """Run all timetable-level constraint audits and return a deduped violation list."""
    all_v = []
    # Per-cell evaluation
    for c in cells:
        teacher = teachers_by_id.get(c.get('teacher_id'))
        sub = subjects_by_id.get(c.get('subject_id'))
        cls = classes_by_id.get(c.get('class_id'))
        period = periods_by_id.get(c.get('period_id'))
        ctx = {
            'teacher': teacher.get('abbreviation') if teacher else '',
            'subject': sub.get('name') if sub else '',
            'class': (cls.get('standard') or cls.get('grade', '')) if cls else '',
            'day': c.get('day', ''),
            'period': period.get('name') if period else '',
        }
        for v in evaluate_cell(rules, ctx):
            v['cell_id'] = c.get('id')
            v['day'] = c.get('day')
            v['period_id'] = c.get('period_id')
            v['class_id'] = c.get('class_id')
            all_v.append(v)
    # Cross-cell handlers
    all_v += evaluate_consecutive(rules, cells, subjects_by_id, classes_by_id, periods_by_id)
    all_v += evaluate_simultaneous(rules, cells, subjects_by_id)
    all_v += evaluate_clubbed_by_grade(rules, cells, subjects_by_id, classes_by_id)
    return all_v
