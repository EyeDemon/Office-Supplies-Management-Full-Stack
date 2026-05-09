import React from 'react';
import { Row, Col, Card, Table, Form, Button, Pagination } from 'react-bootstrap';
import { IcoSearch, IcoPlus, IcoEdit, IcoTrash } from '@/components/common/Icons.jsx';
import { SkeletonBar, SkeletonRow } from '@/components/common/SkeletonRow.jsx';
import EmptyState from '@/components/common/EmptyState.jsx';
import { RoleBadge } from './UserManagementHelpers';
import { useAuth } from '@/contexts/AuthContext.jsx';

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const ActiveUserTab = ({
  users, totalCount, totalPages, loading, page, size, searchInput, setSearchInput,
  roleFilter, setRoleFilter, deptFilter, setDeptFilter, setSize, setPage,
  onAdd, onEdit, onDelete, departments
}) => {
  const { user: currentUser } = useAuth();

  const getPaginationItems = () => {
    const items = [], delta = 2;
    const left  = Math.max(0, page - delta);
    const right = Math.min(totalPages - 1, page + delta);
    if (left > 0)  items.push(<Pagination.Item key={0} onClick={() => setPage(0)}>1</Pagination.Item>);
    if (left > 1)  items.push(<Pagination.Ellipsis key="el1" disabled />);
    for (let i = left; i <= right; i++)
      items.push(<Pagination.Item key={i} active={i === page} onClick={() => setPage(i)}>{i + 1}</Pagination.Item>);
    if (right < totalPages - 2) items.push(<Pagination.Ellipsis key="el2" disabled />);
    if (right < totalPages - 1)
      items.push(<Pagination.Item key={totalPages - 1} onClick={() => setPage(totalPages - 1)}>{totalPages}</Pagination.Item>);
    return items;
  };

  return (
    <>
      <Card className="mb-3 shadow-sm border-0">
        <Card.Body>
          <Row className="g-2 align-items-end">
            <Col xs={12} md={4}>
              <Form.Label className="small fw-bold">Tìm kiếm</Form.Label>
              <div className="search-bar" style={{position:"relative"}}>
                <span className="search-bar-icon" style={{position:"absolute",left:".75rem",top:"50%",transform:"translateY(-50%)",zIndex:4,color:"var(--text-muted)"}}>
                  <IcoSearch size={14} />
                </span>
                <Form.Control placeholder="Username, tên, email..."
                  value={searchInput} onChange={e => setSearchInput(e.target.value)} />
                {searchInput && (
                  <button className="icon-btn icon-btn-ghost" onClick={() => setSearchInput('')}>×</button>
                )}
              </div>
            </Col>
            <Col xs={6} md={2}>
              <Form.Label className="small fw-bold">Vai trò</Form.Label>
              <Form.Select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(0); }}>
                <option value="">Tất cả</option>
                <option value="ADMIN">Admin</option>
                <option value="MANAGER">Manager</option>
                <option value="WAREHOUSE">Nhân viên kho</option>
                <option value="USER">Nhân viên</option>
              </Form.Select>
            </Col>
            <Col xs={6} md={2}>
              <Form.Label className="small fw-bold">Phòng ban</Form.Label>
              <Form.Select value={deptFilter} onChange={e => { setDeptFilter(e.target.value); setPage(0); }}>
                <option value="">Tất cả</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </Form.Select>
            </Col>
            <Col xs={6} md={2}>
              <Form.Label className="small fw-bold">Hiển thị</Form.Label>
              <Form.Select value={size} onChange={e => { setSize(Number(e.target.value)); setPage(0); }}>
                {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n} / trang</option>)}
              </Form.Select>
            </Col>
            <Col xs={12} md={2} className="text-end d-flex align-items-end justify-content-end">
              <div>
                <span className="text-muted small me-2">
                  {loading ? <SkeletonBar width={60} height={16} /> : `${totalCount} người dùng`}
                </span>
                <Button variant="primary" onClick={onAdd}><IcoPlus size={14}/> Thêm</Button>
              </div>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Card className="shadow-sm border-0 d-none d-md-block">
        <Card.Body className="p-0">
          <Table responsive hover className="mb-0">
            <thead className="table-dark">
              <tr>
                <th style={{ width: 50 }}>#</th>
                <th>Username</th><th>Họ tên</th><th>Email</th>
                <th>SĐT</th><th>Vai trò</th><th>Ngày tạo</th>
                <th className="text-center" style={{ width: 110 }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8}>
                  <table className="table table-sm mb-0"><tbody>
                    {[1,2,3,4,5].map(i=><SkeletonRow key={i} cols={8}/>)}
                  </tbody></table>
                </td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={8}>
                  <EmptyState icon="user" message="Không có người dùng nào" sub="Thử thay đổi bộ lọc hoặc tạo tài khoản mới" />
                </td></tr>
              ) : users.map((u, i) => (
                <tr key={u.id}>
                  <td><small className="text-muted">{page * size + i + 1}</small></td>
                  <td>
                    <strong>{u.username}</strong>
                    {u.id === currentUser?.id && <span className="text-muted ms-1 small">(bạn)</span>}
                  </td>
                  <td>{u.fullName || '—'}</td>
                  <td><small>{u.email || '—'}</small></td>
                  <td><small>{u.phoneNumber || '—'}</small></td>
                  <td><RoleBadge role={u.role} /></td>
                  <td><small className="text-muted">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString('vi-VN') : '—'}
                  </small></td>
                  <td className="text-center">
                    <button className="icon-btn icon-btn-primary" title="Sửa" onClick={()=>onEdit(u)}><IcoEdit/></button>
                    {u.id !== currentUser?.id && (
                      <button className="icon-btn icon-btn-danger" title="Xóa" onClick={()=>onDelete(u)}><IcoTrash/></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card.Body>

        {totalPages > 1 && (
          <Card.Footer className="d-flex justify-content-between align-items-center py-2">
            <small className="text-muted">
              {page * size + 1}–{Math.min((page + 1) * size, totalCount)} / {totalCount}
            </small>
            <Pagination className="mb-0" size="sm">
              <Pagination.First onClick={() => setPage(0)} disabled={page === 0} />
              <Pagination.Prev  onClick={() => setPage(p => p - 1)} disabled={page === 0} />
              {getPaginationItems()}
              <Pagination.Next onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1} />
              <Pagination.Last onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} />
            </Pagination>
          </Card.Footer>
        )}
      </Card>

      <div className="d-md-none">
        {loading ? (
          <div>{[1,2,3].map(i=>(
            <Card key={i} className="mb-2 shadow-sm border-0">
              <Card.Body className="py-2 px-3">
                <SkeletonBar width="60%" height={16} style={{marginBottom:6}} />
                <SkeletonBar width="80%" height={12} />
              </Card.Body>
            </Card>
          ))}</div>
        ) : users.length === 0 ? (
          <EmptyState icon="user" message="Không có người dùng nào" sub="Thử thay đổi bộ lọc hoặc tạo tài khoản mới" />
        ) : users.map(u => (
          <Card key={u.id} className="mb-2 shadow-sm border-0">
            <Card.Body className="py-2 px-3">
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  <strong>{u.username}</strong>
                  {u.id === currentUser?.id && <span className="text-muted ms-1 small">(bạn)</span>}
                  <div className="text-muted small">{u.fullName}</div>
                  <div className="text-muted small">{u.email}</div>
                </div>
                <div className="text-end">
                  <RoleBadge role={u.role} />
                  <div className="mt-1">
                    <button className="icon-btn icon-btn-primary" title="Sửa" onClick={()=>onEdit(u)}><IcoEdit/></button>
                    {u.id !== currentUser?.id && (
                      <button className="icon-btn icon-btn-danger" title="Xóa" onClick={()=>onDelete(u)}><IcoTrash/></button>
                    )}
                  </div>
                </div>
              </div>
            </Card.Body>
          </Card>
        ))}
      </div>
    </>
  );
};

export default ActiveUserTab;
