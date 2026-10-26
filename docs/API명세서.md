---
doc_type: API명세서
project: PRJ-2
project_name: TODOLIST
version: "0.3"
status: 작성 중
author: Jinny
created: 2026-10-26
updated: 2026-10-26
notion: "https://app.notion.com/p/4058ab5537d4816e8b92d68009c62545"
openapi: ""
---

# TODOLIST API 명세서

## 1. 공통 사항

이 앱은 서버가 없는 Electron 데스크톱 앱이다. 여기서 API는 Renderer(React 화면)가 Main 프로세스를 부르는 **IPC 채널**을 뜻한다. 메서드는 `invoke`(`ipcRenderer.invoke` ↔ `ipcMain.handle`, 요청-응답) 하나이고, 경로 자리에 채널명(`namespace:action`)을 적는다.

| 항목 | 내용 |
|---|---|
| Base URL | 해당 없음 (로컬 IPC). Renderer는 preload가 `contextBridge`로 노출한 `window.electronAPI`만 쓴다. 예: `window.electronAPI.task.list({ date })` → `ipcRenderer.invoke('task:list', { date })` |
| 채널 상수 | `src/shared/ipc-channels.ts`의 `IPC_CHANNELS`에 모아 Main·preload가 같이 쓴다 |
| 보안 | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Main 핸들러에서 입력값을 다시 검증한다 |
| 형식 | JSON 직렬화 가능한 객체 (UTF-8) |
| 인증 | 없음 (단일 사용자 로컬 앱) |
| 날짜 형식 | 날짜 `YYYY-MM-DD`, 일시 ISO 8601 (`2026-10-26T09:00:00Z`) |
| 페이지네이션 | 사용하지 않음 (날짜·주 단위 조회만 있음) |
| 응답 형식 | 성공 `{ "success": true, "data": ... }` / 실패 `{ "success": false, "error": { code, message } }` |
| 관련 문서 | 화면설계서, ERD |

### 1.1 공통 오류 응답

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "요청한 데이터를 찾을 수 없습니다.",
    "timestamp": "2026-10-26T09:00:00Z"
  }
}
```

| HTTP 상태 | code | 의미 |
|---|---|---|
| – | INVALID_INPUT | 입력값 오류 |
| – | NOT_FOUND | 대상 없음 |
| – | CONFLICT | 상태 충돌 (예: 연기된 원본의 상태 변경, 중복 태그명) |
| – | INTERNAL_ERROR | DB 오류 등 내부 오류 |
| – | CANCELED | 사용자가 OS 대화상자를 닫음 (API-19, API-20) |

> 로컬 IPC라 HTTP 상태 코드는 쓰지 않는다. 인증 관련 코드(UNAUTHORIZED, FORBIDDEN)는 해당 없음.

### 1.2 공통 객체 `Task`

| 필드 | 타입 | 설명 |
|---|---|---|
| id | integer | 할 일 ID |
| title | string | 제목 |
| memo | string \| null | 메모 |
| taskDate | string | 날짜 `YYYY-MM-DD` |
| priority | string | high / normal / low |
| sortOrder | integer | 순서 |
| status | string | waiting / in_progress / done / postponed / canceled |
| statusReason | string \| null | 연기·취소 사유 |
| postponedToDate | string \| null | 연기된 원본의 새 날짜 |
| postponedFrom | object \| null | 연기로 생긴 경우 `{ id, taskDate }` |
| recurrenceRuleId | integer \| null | 반복 규칙 ID |
| dueDate | string \| null | 마감일 |
| remindAt | string \| null | 알림 일시 |
| completedAt | string \| null | 완료 일시 |
| tags | object[] | `[{ id, name, color }]` |

## 2. API 목록

| API ID | 메서드 | 경로 | 설명 | 인증 | 관련 화면 | 관련 REQ |
|---|---|---|---|---|---|---|
| API-01 | invoke | `task:list` | 날짜별 할 일 목록 조회 | 없음 | SCR-01 | REQ-10, REQ-11, REQ-15 |
| API-02 | invoke | `task:create` | 할 일 등록 | 없음 | SCR-02 | REQ-1, REQ-13, REQ-16 |
| API-03 | invoke | `task:update` | 할 일 수정 | 없음 | SCR-01, SCR-02 | REQ-2, REQ-5, REQ-13, REQ-16 |
| API-04 | invoke | `task:delete` | 할 일 삭제 | 없음 | SCR-01, SCR-02 | REQ-3 |
| API-05 | invoke | `task:bulk-create` | 아침 일괄 등록 | 없음 | SCR-03 | REQ-4 |
| API-06 | invoke | `task:reorder` | 순서 변경 | 없음 | SCR-01 | REQ-5 |
| API-07 | invoke | `task:change-status` | 상태 변경 (완료·연기·취소 포함) | 없음 | SCR-01, SCR-04 | REQ-6, REQ-7, REQ-8, REQ-9 |
| API-08 | invoke | `task:history` | 상태 이력·최근 사유 조회 | 없음 | SCR-02, SCR-04 | REQ-6 |
| API-09 | invoke | `calendar:month-summary` | 월 달력 날짜별 요약 | 없음 | SCR-05 | REQ-11 |
| API-10 | invoke | `stats:weekly` | 주간 통계 | 없음 | SCR-06 | REQ-12 |
| API-11 | invoke | `tag:list` | 태그 목록 | 없음 | SCR-01, SCR-02, SCR-07 | REQ-15 |
| API-12 | invoke | `tag:save` | 태그 생성·수정 | 없음 | SCR-07 | REQ-15 |
| API-13 | invoke | `tag:delete` | 태그 삭제 | 없음 | SCR-07 | REQ-15 |
| API-14 | invoke | `recurrence:list` | 반복 규칙 목록 | 없음 | SCR-07 | REQ-14 |
| API-15 | invoke | `recurrence:save` | 반복 규칙 생성·수정 | 없음 | SCR-02, SCR-07 | REQ-14 |
| API-16 | invoke | `recurrence:delete` | 반복 규칙 삭제 | 없음 | SCR-07 | REQ-14 |
| API-17 | invoke | `settings:get` | 설정 조회 | 없음 | SCR-07 | REQ-16 |
| API-18 | invoke | `settings:update` | 설정 변경 | 없음 | SCR-07 | REQ-16 |
| API-19 | invoke | `data:export` | 백업 내보내기 | 없음 | SCR-07 | REQ-18 |
| API-20 | invoke | `share:export` | 하루 목록·주간 통계 공유 (텍스트/이미지) | 없음 | SCR-08 | REQ-17 |

## 3. API 상세

### API-01 날짜별 할 일 목록 조회

`invoke task:list`

| 항목 | 내용 |
|---|---|
| 설명 | 지정한 날짜의 할 일을 정렬해서 돌려준다. 정렬: 미처리(대기·진행) 먼저 → priority(high→low) → sortOrder |
| 권한 | 없음 |
| 관련 화면 / REQ | SCR-01 / REQ-10, REQ-11, REQ-15 |
| 사용 테이블 | task, task_tag, tag |

**요청 파라미터**

| 위치 | 이름 | 타입 | 필수 | 설명 | 예시 |
|---|---|---|---|---|---|
| body | date | string | Y | 조회 날짜 | 2026-10-26 |
| body | tagIds | integer[] | N | 태그 필터 (OR) | [2] |
| body | statuses | string[] | N | 상태 필터 | ["waiting"] |

**요청 예시**

```json
{ "date": "2026-10-26" }
```

**응답 (성공)**

| 필드 | 타입 | 설명 |
|---|---|---|
| date | string | 조회 날짜 |
| items | Task[] | 할 일 목록 |
| summary | object | `{ waiting, in_progress, done, postponed, canceled, total }` |

```json
{
  "success": true,
  "data": {
    "date": "2026-10-26",
    "items": [
      { "id": 12, "title": "제안서 초안 작성", "taskDate": "2026-10-26", "priority": "high",
        "sortOrder": 0, "status": "in_progress", "statusReason": null, "postponedFrom": null,
        "dueDate": "2026-10-27", "tags": [{ "id": 2, "name": "업무", "color": "#2563EB" }] }
    ],
    "summary": { "waiting": 3, "in_progress": 1, "done": 2, "postponed": 1, "canceled": 0, "total": 7 }
  }
}
```

**오류**

| HTTP 상태 | code | 발생 조건 |
|---|---|---|
| – | INVALID_INPUT | date 형식 오류 |

### API-02 할 일 등록

`invoke task:create`

| 항목 | 내용 |
|---|---|
| 설명 | 할 일 하나를 등록한다. 상태는 waiting, sortOrder는 같은 날짜·등급의 마지막. 상태 이력(NULL→waiting) 1건을 남긴다 |
| 권한 | 없음 |
| 관련 화면 / REQ | SCR-02 / REQ-1, REQ-13, REQ-16 |
| 사용 테이블 | task, task_tag, task_status_history |

**요청 파라미터**

| 위치 | 이름 | 타입 | 필수 | 설명 | 예시 |
|---|---|---|---|---|---|
| body | title | string | Y | 1~200자 | 고객 메일 회신 |
| body | taskDate | string | Y | 날짜 | 2026-10-26 |
| body | priority | string | N | 기본 normal | high |
| body | memo | string | N | 2,000자 이하 | |
| body | dueDate | string | N | taskDate 이후 | 2026-10-27 |
| body | remindAt | string | N | 알림 일시 | 2026-10-26T05:00:00Z |
| body | tagIds | integer[] | N | 10개 이하 | [2] |

**요청 예시**

```json
{ "title": "고객 메일 회신", "taskDate": "2026-10-26", "priority": "high", "tagIds": [2] }
```

**응답 (성공)**

| 필드 | 타입 | 설명 |
|---|---|---|
| data | Task | 생성된 할 일 |

**오류**

| HTTP 상태 | code | 발생 조건 |
|---|---|---|
| – | INVALID_INPUT | 제목 누락·길이 초과, 날짜 형식 오류, 마감일이 날짜보다 빠름, 태그 10개 초과 |
| – | NOT_FOUND | 없는 tagId |

### API-03 할 일 수정

`invoke task:update`

| 항목 | 내용 |
|---|---|
| 설명 | 보낸 필드만 고친다. taskDate를 바꾸면 새 날짜의 같은 등급 마지막 순서로 옮긴다. 상태는 이 API로 바꾸지 않는다 (API-07) |
| 권한 | 없음 |
| 관련 화면 / REQ | SCR-01, SCR-02 / REQ-2, REQ-5, REQ-13, REQ-16 |
| 사용 테이블 | task, task_tag |

**요청 파라미터**

| 위치 | 이름 | 타입 | 필수 | 설명 | 예시 |
|---|---|---|---|---|---|
| body | id | integer | Y | 할 일 ID | 12 |
| body | title, taskDate, priority, memo, dueDate, remindAt, tagIds | – | N | API-02와 같은 규칙. `null`은 값 지우기 | |

**요청 예시**

```json
{ "id": 12, "priority": "low" }
```

**응답 (성공)**

| 필드 | 타입 | 설명 |
|---|---|---|
| data | Task | 수정된 할 일 |

**오류**

| HTTP 상태 | code | 발생 조건 |
|---|---|---|
| – | NOT_FOUND | 없는 id |
| – | INVALID_INPUT | API-02와 같은 검증 실패 |
| – | CONFLICT | 연기된 원본(status = postponed)의 날짜 변경 |

### API-04 할 일 삭제

`invoke task:delete`

| 항목 | 내용 |
|---|---|
| 설명 | 할 일을 지운다. 이력·태그 연결도 함께 지운다. 이 할 일을 원본으로 가리키는 연기 행은 postponedFrom이 NULL이 된다 |
| 권한 | 없음 |
| 관련 화면 / REQ | SCR-01, SCR-02 / REQ-3 |
| 사용 테이블 | task, task_status_history, task_tag |

**요청 파라미터**

| 위치 | 이름 | 타입 | 필수 | 설명 | 예시 |
|---|---|---|---|---|---|
| body | id | integer | Y | 할 일 ID | 12 |

**응답 (성공)**

```json
{ "success": true, "data": { "id": 12 } }
```

**오류**

| HTTP 상태 | code | 발생 조건 |
|---|---|---|
| – | NOT_FOUND | 없는 id |

> TODO: 화면의 "되돌리기"(5초)를 UI에서 지연 삭제로 처리할지, 복구 API를 둘지 개발 시 결정.

### API-05 아침 일괄 등록

`invoke task:bulk-create`

| 항목 | 내용 |
|---|---|
| 설명 | 여러 줄 텍스트를 줄 단위로 나눠 한 번에 등록한다. 목록 기호와 빈 줄은 제거한다. 하나라도 실패하면 전체를 취소한다(트랜잭션) |
| 권한 | 없음 |
| 관련 화면 / REQ | SCR-03 / REQ-4 |
| 사용 테이블 | task, task_status_history |

**요청 파라미터**

| 위치 | 이름 | 타입 | 필수 | 설명 | 예시 |
|---|---|---|---|---|---|
| body | taskDate | string | Y | 등록 날짜 | 2026-10-26 |
| body | text | string | Y | 여러 줄 텍스트 | "- 제안서 초안\n- 메일 회신" |
| body | priority | string | N | 기본 normal | normal |

**요청 예시**

```json
{ "taskDate": "2026-10-26", "text": "- 제안서 초안 작성\n- 고객 메일 회신\n\n- 운동 30분", "priority": "normal" }
```

**응답 (성공)**

| 필드 | 타입 | 설명 |
|---|---|---|
| items | Task[] | 등록된 할 일 (입력 순서) |
| count | integer | 등록 건수 |

**오류**

| HTTP 상태 | code | 발생 조건 |
|---|---|---|
| – | INVALID_INPUT | 유효한 줄 0건, 50건 초과, 200자 초과 줄 (오류에 줄 번호 포함) |

### API-06 순서 변경

`invoke task:reorder`

| 항목 | 내용 |
|---|---|
| 설명 | 같은 날짜·같은 등급 안의 순서를 받은 ID 순서대로 다시 매긴다 |
| 권한 | 없음 |
| 관련 화면 / REQ | SCR-01 / REQ-5 |
| 사용 테이블 | task |

**요청 파라미터**

| 위치 | 이름 | 타입 | 필수 | 설명 | 예시 |
|---|---|---|---|---|---|
| body | taskDate | string | Y | 날짜 | 2026-10-26 |
| body | priority | string | Y | 대상 등급 | high |
| body | orderedIds | integer[] | Y | 새 순서의 ID 목록 | [14, 12] |

**응답 (성공)**

```json
{ "success": true, "data": { "updated": 2 } }
```

**오류**

| HTTP 상태 | code | 발생 조건 |
|---|---|---|
| – | INVALID_INPUT | orderedIds에 다른 날짜·등급의 ID가 섞임 |

### API-07 상태 변경

`invoke task:change-status`

| 항목 | 내용 |
|---|---|
| 설명 | 상태를 바꾸고 이력을 남긴다. done → completedAt 기록. postponed → 원본에 사유·연기 날짜 기록 후 새 날짜에 할 일 생성. canceled → 사유 기록. `revert: true`면 완료 해제(직전 상태로 복귀) |
| 권한 | 없음 |
| 관련 화면 / REQ | SCR-01, SCR-04 / REQ-6, REQ-7, REQ-8, REQ-9 |
| 사용 테이블 | task, task_status_history, task_tag |

**요청 파라미터**

| 위치 | 이름 | 타입 | 필수 | 설명 | 예시 |
|---|---|---|---|---|---|
| body | id | integer | Y | 할 일 ID | 15 |
| body | status | string | Y (revert 아닐 때) | 새 상태 | postponed |
| body | reason | string | 조건부 | postponed·canceled일 때 필수, 1~200자 | 서류 미비 |
| body | postponeDate | string | 조건부 | postponed일 때 필수, 원래 날짜보다 뒤 | 2026-10-28 |
| body | revert | boolean | N | 완료 해제 | false |

**요청 예시**

```json
{ "id": 15, "status": "postponed", "reason": "서류 미비", "postponeDate": "2026-10-28" }
```

**응답 (성공)**

| 필드 | 타입 | 설명 |
|---|---|---|
| task | Task | 상태가 바뀐 할 일 |
| createdTask | Task \| null | 연기로 새로 만든 할 일 |

```json
{
  "success": true,
  "data": {
    "task": { "id": 15, "status": "postponed", "statusReason": "서류 미비", "postponedToDate": "2026-10-28" },
    "createdTask": { "id": 31, "taskDate": "2026-10-28", "status": "waiting", "postponedFrom": { "id": 15, "taskDate": "2026-10-26" } }
  }
}
```

**오류**

| HTTP 상태 | code | 발생 조건 |
|---|---|---|
| – | INVALID_INPUT | 사유 누락, 연기 날짜 누락·원래 날짜 이전, 없는 상태 코드 |
| – | NOT_FOUND | 없는 id |
| – | CONFLICT | 연기된 원본의 상태 변경, 완료가 아닌 항목에 revert |

### API-08 상태 이력·최근 사유 조회

`invoke task:history`

| 항목 | 내용 |
|---|---|
| 설명 | id를 주면 그 할 일의 이력을, recentReasons를 주면 최근 사유 목록을 돌려준다. 연기 원본을 따라가 연기 체인 전체 이력을 합쳐 보여준다 |
| 권한 | 없음 |
| 관련 화면 / REQ | SCR-02, SCR-04 / REQ-6 |
| 사용 테이블 | task_status_history, task |

**요청 파라미터**

| 위치 | 이름 | 타입 | 필수 | 설명 | 예시 |
|---|---|---|---|---|---|
| body | id | integer | N | 할 일 ID | 31 |
| body | recentReasons | object | N | `{ status: "postponed" \| "canceled", limit: 5 }` | |

**응답 (성공)**

| 필드 | 타입 | 설명 |
|---|---|---|
| history[] | object | `{ taskId, taskDate, fromStatus, toStatus, reason, postponeDate, changedAt }` |
| reasons[] | string | 최근 사유 (중복 제거) |

**오류**

| HTTP 상태 | code | 발생 조건 |
|---|---|---|
| – | INVALID_INPUT | id와 recentReasons 모두 없음 |
| – | NOT_FOUND | 없는 id |

### API-09 월 달력 날짜별 요약

`invoke calendar:month-summary`

| 항목 | 내용 |
|---|---|
| 설명 | 지정한 달의 날짜별 상태 건수를 돌려준다 |
| 권한 | 없음 |
| 관련 화면 / REQ | SCR-05 / REQ-11 |
| 사용 테이블 | task |

**요청 파라미터**

| 위치 | 이름 | 타입 | 필수 | 설명 | 예시 |
|---|---|---|---|---|---|
| body | month | string | Y | `YYYY-MM` | 2026-10 |

**응답 (성공)**

```json
{
  "success": true,
  "data": {
    "month": "2026-10",
    "days": [
      { "date": "2026-10-26", "total": 7, "waiting": 3, "in_progress": 1, "done": 2, "postponed": 1, "canceled": 0 }
    ]
  }
}
```

**오류**

| HTTP 상태 | code | 발생 조건 |
|---|---|---|
| – | INVALID_INPUT | month 형식 오류 |

### API-10 주간 통계

`invoke stats:weekly`

| 항목 | 내용 |
|---|---|
| 설명 | 주 시작일부터 7일간 task_date 기준으로 집계한다. 완료율 = done / (total − canceled) (추정) |
| 권한 | 없음 |
| 관련 화면 / REQ | SCR-06 / REQ-12 |
| 사용 테이블 | task, task_status_history |

**요청 파라미터**

| 위치 | 이름 | 타입 | 필수 | 설명 | 예시 |
|---|---|---|---|---|---|
| body | weekStart | string | Y | 주 시작일 (월요일) | 2026-10-26 |

**응답 (성공)**

| 필드 | 타입 | 설명 |
|---|---|---|
| range | object | `{ start, end }` |
| totals | object | `{ total, waiting, in_progress, done, postponed, canceled }` |
| completionRate | integer | 완료율 % |
| byDay[] | object | `{ date, waiting, in_progress, done, postponed, canceled }` |
| postponeReasons[] | object | `{ reason, count }` |
| cancelReasons[] | object | `{ reason, count }` |
| repeatedlyPostponed[] | object | `{ title, count, latestTaskId }` (2회 이상) |

**오류**

| HTTP 상태 | code | 발생 조건 |
|---|---|---|
| – | INVALID_INPUT | 날짜 형식 오류 |

### API-11 태그 목록

`invoke tag:list`

| 항목 | 내용 |
|---|---|
| 설명 | 전체 태그와 사용 건수 |
| 권한 | 없음 |
| 관련 화면 / REQ | SCR-01, SCR-02, SCR-07 / REQ-15 |
| 사용 테이블 | tag, task_tag |

**요청 파라미터**: 없음

**응답 (성공)**

| 필드 | 타입 | 설명 |
|---|---|---|
| items[] | object | `{ id, name, color, taskCount }` |

**오류**: 공통 오류만

### API-12 태그 생성·수정

`invoke tag:save`

| 항목 | 내용 |
|---|---|
| 설명 | id가 없으면 생성, 있으면 수정 |
| 권한 | 없음 |
| 관련 화면 / REQ | SCR-07 / REQ-15 |
| 사용 테이블 | tag |

**요청 파라미터**

| 위치 | 이름 | 타입 | 필수 | 설명 | 예시 |
|---|---|---|---|---|---|
| body | id | integer | N | 수정 시 | 2 |
| body | name | string | Y | 1~20자 | 업무 |
| body | color | string | N | `#RRGGBB` | #2563EB |

**응답 (성공)**: `data` = `{ id, name, color }`

**오류**

| HTTP 상태 | code | 발생 조건 |
|---|---|---|
| – | INVALID_INPUT | 이름 길이, 색 형식 |
| – | CONFLICT | 같은 이름 존재 |
| – | NOT_FOUND | 없는 id |

### API-13 태그 삭제

`invoke tag:delete`

| 항목 | 내용 |
|---|---|
| 설명 | 태그를 지우고 할 일에서 떼어낸다 (할 일은 남음) |
| 권한 | 없음 |
| 관련 화면 / REQ | SCR-07 / REQ-15 |
| 사용 테이블 | tag, task_tag |

**요청 파라미터**

| 위치 | 이름 | 타입 | 필수 | 설명 | 예시 |
|---|---|---|---|---|---|
| body | id | integer | Y | 태그 ID | 2 |

**응답 (성공)**: `data` = `{ id }`

**오류**

| HTTP 상태 | code | 발생 조건 |
|---|---|---|
| – | NOT_FOUND | 없는 id |

### API-14 반복 규칙 목록

`invoke recurrence:list`

| 항목 | 내용 |
|---|---|
| 설명 | 반복 규칙 전체 |
| 권한 | 없음 |
| 관련 화면 / REQ | SCR-07 / REQ-14 |
| 사용 테이블 | recurrence_rule |

**요청 파라미터**: 없음

**응답 (성공)**

| 필드 | 타입 | 설명 |
|---|---|---|
| items[] | object | `{ id, title, priority, ruleType, weekdays, monthDay, startDate, endDate, isActive }` |

**오류**: 공통 오류만

### API-15 반복 규칙 생성·수정

`invoke recurrence:save`

| 항목 | 내용 |
|---|---|
| 설명 | id가 없으면 생성, 있으면 수정. 저장 직후 오늘까지 해당하는 날짜의 할 일을 생성한다. 같은 규칙·같은 날짜는 한 번만 생성한다 |
| 권한 | 없음 |
| 관련 화면 / REQ | SCR-02, SCR-07 / REQ-14 |
| 사용 테이블 | recurrence_rule, task |

**요청 파라미터**

| 위치 | 이름 | 타입 | 필수 | 설명 | 예시 |
|---|---|---|---|---|---|
| body | id | integer | N | 수정 시 | 3 |
| body | title | string | Y | 1~200자 | 운동 30분 |
| body | priority | string | N | 기본 normal | normal |
| body | ruleType | string | Y | daily / weekdays / weekly / monthly | weekly |
| body | weekdays | integer[] | 조건부 | weekly일 때 1~7 | [1, 3, 5] |
| body | monthDay | integer | 조건부 | monthly일 때 1~31 | 15 |
| body | startDate | string | Y | 시작일 | 2026-10-26 |
| body | endDate | string | N | 종료일 | |
| body | isActive | boolean | N | 기본 true | true |

**응답 (성공)**: `data` = 저장된 규칙 + `generatedCount`

**오류**

| HTTP 상태 | code | 발생 조건 |
|---|---|---|
| – | INVALID_INPUT | 유형별 필수값 누락, 종료일이 시작일보다 빠름 |
| – | NOT_FOUND | 없는 id |

> 앱 실행 시에도 활성 규칙을 확인해 `last_generated_date` 다음 날부터 오늘까지 할 일을 만든다 (앱 내부 처리, 별도 API 아님).

### API-16 반복 규칙 삭제

`invoke recurrence:delete`

| 항목 | 내용 |
|---|---|
| 설명 | 규칙을 지운다. 이미 생성된 할 일은 남기고 recurrenceRuleId만 NULL로 바꾼다 |
| 권한 | 없음 |
| 관련 화면 / REQ | SCR-07 / REQ-14 |
| 사용 테이블 | recurrence_rule, task |

**요청 파라미터**

| 위치 | 이름 | 타입 | 필수 | 설명 | 예시 |
|---|---|---|---|---|---|
| body | id | integer | Y | 규칙 ID | 3 |

**응답 (성공)**: `data` = `{ id }`

**오류**

| HTTP 상태 | code | 발생 조건 |
|---|---|---|
| – | NOT_FOUND | 없는 id |

### API-17 설정 조회

`invoke settings:get`

| 항목 | 내용 |
|---|---|
| 설명 | 전체 설정을 객체로 돌려준다. 없는 키는 기본값 |
| 권한 | 없음 |
| 관련 화면 / REQ | SCR-07 / REQ-16 |
| 사용 테이블 | app_setting |

**요청 파라미터**: 없음

**응답 (성공)**

```json
{
  "success": true,
  "data": { "morningReminderEnabled": false, "morningReminderTime": "08:30", "taskReminderEnabled": true }
}
```

**오류**: 공통 오류만

### API-18 설정 변경

`invoke settings:update`

| 항목 | 내용 |
|---|---|
| 설명 | 보낸 키만 바꾼다. 알림 설정이 바뀌면 알림 스케줄을 다시 잡는다 |
| 권한 | 없음 |
| 관련 화면 / REQ | SCR-07 / REQ-16 |
| 사용 테이블 | app_setting |

**요청 파라미터**

| 위치 | 이름 | 타입 | 필수 | 설명 | 예시 |
|---|---|---|---|---|---|
| body | morningReminderEnabled | boolean | N | 아침 등록 알림 | true |
| body | morningReminderTime | string | N | `HH:mm` | 08:30 |
| body | taskReminderEnabled | boolean | N | 할 일 알림 | true |

**응답 (성공)**: `data` = 변경 후 전체 설정 (API-17과 같음)

**오류**

| HTTP 상태 | code | 발생 조건 |
|---|---|---|
| – | INVALID_INPUT | 시각 형식 오류, 모르는 키 |

### API-19 백업 내보내기

`invoke data:export`

| 항목 | 내용 |
|---|---|
| 설명 | OS 저장 대화상자(`dialog.showSaveDialog`)로 위치를 받아 전체 데이터를 내보낸다 |
| 권한 | 없음 |
| 관련 화면 / REQ | SCR-07 / REQ-18 |
| 사용 테이블 | 전체 |

**요청 파라미터**

| 위치 | 이름 | 타입 | 필수 | 설명 | 예시 |
|---|---|---|---|---|---|
| body | format | string | Y | `sqlite` (DB 파일 복사) / `json` | json |

**응답 (성공)**: `data` = `{ path, bytes }`. 사용자가 대화상자를 닫으면 `{ "success": false, "error": { "code": "CANCELED" } }`

**오류**

| HTTP 상태 | code | 발생 조건 |
|---|---|---|
| – | INVALID_INPUT | 모르는 format |
| – | INTERNAL_ERROR | 파일 쓰기 실패 |

> TODO: 백업 가져오기(복원) 필요 여부 확인.

### API-20 하루 목록·주간 통계 공유

`invoke share:export`

| 항목 | 내용 |
|---|---|
| 설명 | 텍스트는 Main이 DB에서 문자열을 만들어 돌려주거나 클립보드(`clipboard.writeText`)에 넣는다. 이미지는 Renderer가 넘긴 화면 영역을 Main이 `webContents.capturePage(rect)`로 캡처해 클립보드(`clipboard.writeImage`)에 넣거나 PNG로 저장한다 |
| 권한 | 없음 |
| 관련 화면 / REQ | SCR-08 / REQ-17 |
| 사용 테이블 | task, task_status_history (텍스트 생성 시) |

**요청 파라미터**

| 위치 | 이름 | 타입 | 필수 | 설명 | 예시 |
|---|---|---|---|---|---|
| body | scope | string | Y | `day` / `week` | day |
| body | date | string | 조건부 | scope = day일 때 | 2026-10-26 |
| body | weekStart | string | 조건부 | scope = week일 때 | 2026-10-26 |
| body | format | string | Y | `text` / `image` | text |
| body | target | string | Y | `preview`(내용만 반환) / `clipboard` / `file`(image만) | clipboard |
| body | rect | object | 조건부 | format = image일 때 캡처 영역 `{ x, y, width, height }` | |

**요청 예시**

```json
{ "scope": "day", "date": "2026-10-26", "format": "text", "target": "clipboard" }
```

**응답 (성공)**

| 필드 | 타입 | 설명 |
|---|---|---|
| format | string | text / image |
| text | string \| null | format = text일 때 생성된 문자열 |
| imageDataUrl | string \| null | target = preview이고 image일 때 미리보기용 data URL |
| path | string \| null | target = file일 때 저장 경로 |

```json
{
  "success": true,
  "data": {
    "format": "text",
    "text": "📋 2026-10-26 (월) 할 일 2/7 완료\n☑ 주간 회의\n☐ ▲ 제안서 초안 작성 (진행)\n⤳ 은행 업무 → 10/28 (서류 미비)",
    "imageDataUrl": null,
    "path": null
  }
}
```

**오류**

| HTTP 상태 | code | 발생 조건 |
|---|---|---|
| – | INVALID_INPUT | scope·format·target 조합 오류 (text + file 등), 날짜 형식 오류, image인데 rect 없음 |
| – | NOT_FOUND | 해당 날짜·주에 할 일이 없음 |
| – | CANCELED | 파일 저장 대화상자를 닫음 |

## 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|---|---|---|---|
| 0.1 | 2026-10-26 | Jinny | 최초 작성 (API-01~19) |
| 0.2 | 2026-10-26 | Jinny | Electron IPC 호출 방식·보안 설정 확정 |
| 0.3 | 2026-10-26 | Jinny | API-20 공유 추가 |
