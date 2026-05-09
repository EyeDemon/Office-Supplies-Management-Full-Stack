import React from 'react';
import { Card, Table, Button } from 'react-bootstrap';
import { SkeletonRow } from '@/components/common/SkeletonRow.jsx';
import EmptyState from '@/components/common/EmptyState.jsx';
import { RoleBadge } from './UserManagementHelpers';

const DeletedUserTab = ({ users, loading, onRestore }) => {
  return (
    <Card className="shadow-sm border-0">
      <Card.Body className="p-0">
        {loading ? (
          <table className="table table-sm mb-0"><tbody>
            {[1,2,3].map(i=><SkeletonRow key={i} cols={6}/>)}
          </tbody></table>
        ) : users.length === 0 ? (
          <EmptyState icon="user" message="Không có người dùng nào đã xóa" />
        ) : (
          <>
            <Table responsive hover className="mb-0 d-none d-md-table">
              <thead className="table-secondary">
                <tr>
                  <th>#</th><th>Username</th><th>Họ tên</th>
                  <th>Email</th><th>Vai trò</th><th>Ngày xóa</th>
                  <th className="text-center">Khôi phục</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={u.id} className="text-muted">
                    <td><small>{i + 1}</small></td>
                    <td><s>{u.username}</s></td>
                    <td>{u.fullName || '—'}</td>
                    <td><small>{u.email || '—'}</small></td>
                    <td><RoleBadge role={u.role} /></td>
                    <td><small>{u.updatedAt ? new Date(u.updatedAt).toLocaleDateString('vi-VN') : '—'}</small></td>
                    <td className="text-center">
                      <Button size="sm" variant="outline-success" onClick={() => onRestore(u)}>
                        Khôi phục
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>

            <div className="d-md-none p-2">
              {users.map(u => (
                <Card key={u.id} className="mb-2 border-0 bg-light">
                  <Card.Body className="py-2 px-3">
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <s className="text-muted fw-bold">{u.username}</s>
                        <div className="text-muted small">{u.fullName} · {u.email}</div>
                      </div>
                      <button className="icon-btn icon-btn-success" title="Khôi phục" onClick={() => onRestore(u)}>↺</button>
                    </div>
                  </Card.Body>
                </Card>
              ))}
            </div>
          </>
        )}
      </Card.Body>
    </Card>
  );
};

export default DeletedUserTab;
