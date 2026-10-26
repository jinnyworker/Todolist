import type { Database } from '../db/database';
import type { Tag, TagSaveInput, TagWithCount } from '../../shared/types';
import { conflict, invalid, notFound } from '../errors';
import { nowIso, requireId, requireObject, requireText } from './validate';

const NAME_MAX = 20;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export class TagService {
  constructor(private readonly db: Database) {}

  list(): { items: TagWithCount[] } {
    const items = this.db
      .all<TagWithCount>(
        `SELECT g.id, g.name, g.color, COUNT(tt.task_id) AS taskCount
         FROM tag g LEFT JOIN task_tag tt ON tt.tag_id = g.id GROUP BY g.id ORDER BY g.name`,
      )
      .map((row) => ({ ...row, taskCount: Number(row.taskCount) }));
    return { items };
  }

  save(raw: unknown): Tag {
    const input = requireObject(raw) as unknown as TagSaveInput;
    const name = requireText(input.name, '태그 이름', NAME_MAX);
    const color = input.color === undefined || input.color === null || input.color === '' ? null : input.color;
    if (color !== null && !COLOR_RE.test(color)) throw invalid('색 형식이 올바르지 않습니다.');

    const id = input.id === undefined ? undefined : requireId(input.id);
    const duplicate = this.db.get<{ id: number }>('SELECT id FROM tag WHERE name = ?', [name]);
    if (duplicate && duplicate.id !== id) throw conflict('이미 있는 태그입니다.');

    const now = nowIso();
    if (id === undefined) {
      const { lastId } = this.db.run('INSERT INTO tag (name, color, created_at, updated_at) VALUES (?, ?, ?, ?)', [
        name,
        color,
        now,
        now,
      ]);
      return { id: lastId, name, color };
    }
    const { changes } = this.db.run('UPDATE tag SET name = ?, color = ?, updated_at = ? WHERE id = ?', [
      name,
      color,
      now,
      id,
    ]);
    if (changes === 0) throw notFound('태그를 찾을 수 없습니다.');
    return { id, name, color };
  }

  delete(raw: unknown): { id: number } {
    const id = requireId(requireObject(raw).id);
    const { changes } = this.db.run('DELETE FROM tag WHERE id = ?', [id]);
    if (changes === 0) throw notFound('태그를 찾을 수 없습니다.');
    return { id };
  }
}
