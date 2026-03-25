import React, { useState } from 'react';
import { Box, Typography, Alert } from '@mui/material';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useAdminUsers } from '../hooks/useAdminData';
import { getUserColumns } from '../config/adminGridConfig';

// FIX: Standardised to 600px — matches TAB_GRID_HEIGHT in UserDetailPage.
// Previously 650px, causing the page to be taller than the detail tabs on navigation back.
const GRID_HEIGHT = 600;

const AdminUsersPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 });
  const [sortModel, setSortModel] = useState([{ field: 'created_at', sort: 'desc' }]);

  const { data, isLoading, isError, error } = useAdminUsers(token, paginationModel, sortModel);

  const columns = getUserColumns(null, { mutate: () => {} });

  if (isError) return <Alert severity="error">Erro ao carregar utilizadores: {error.message}</Alert>;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{
        fontWeight: 800,
        color: 'text.primary',
        letterSpacing: '-0.02em',
        mb: 3,
      }}>
        Utilizadores
      </Typography>

      <Box sx={{ height: GRID_HEIGHT, width: '100%' }}>
          <DataGrid
            rows={data?.users || []}
            columns={columns}
            
            loading={isLoading}
            rowCount={data?.totalRows || 0}
            
            paginationMode="server"
            sortingMode="server"
            
            paginationModel={paginationModel}
            onPaginationModelChange={setPaginationModel}
            sortModel={sortModel}
            onSortModelChange={setSortModel}
            pageSizeOptions={[10, 25, 50, 100]}
            
            slots={{ toolbar: GridToolbar }}
            density="compact"
            disableRowSelectionOnClick
            onRowClick={(params) => navigate(`/admin/users/${params.id}`)}
          />
      </Box>
    </Box>
  );
};

export default AdminUsersPage;
