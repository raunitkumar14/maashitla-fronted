import './IsinMaster.css';

const COLUMNS = ['Name', 'Email', 'Role', 'Status'];

function UsersList() {
  return (
    <div className="isin-master">
      <h1 className="page-heading">User Management</h1>

      <div className="im-card">
        <div className="im-card-header">
          <span>Users List</span>
        </div>

        <div className="im-table-wrapper">
          <table className="im-table">
            <thead>
              <tr>
                {COLUMNS.map((col) => <th key={col}>{col}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="im-empty-state" colSpan={COLUMNS.length}>
                  No users found.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="im-pagination">
          <span className="pagination-info">Showing 0 entries</span>
        </div>
      </div>
    </div>
  );
}

export default UsersList;
