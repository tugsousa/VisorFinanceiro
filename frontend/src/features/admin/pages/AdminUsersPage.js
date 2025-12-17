import React, { useState } from 'react';
import { Box, Typography, Paper, Alert } from '@mui/material';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useAdminUsers } from '../hooks/useAdminData'; // O hook que sugerimos antes
import { getUserColumns } from '../config/adminGridConfig';

const AdminUsersPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  
  // 1. Estados essenciais para o DataGrid funcionar em modo servidor
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 });
  const [sortModel, setSortModel] = useState([{ field: 'created_at', sort: 'desc' }]);

  // 2. Fetch dos dados usando o Hook
  const { data, isLoading, isError, error } = useAdminUsers(token, paginationModel, sortModel);

  // Colunas da tabela
  // Nota: Passamos null/funções vazias se não precisares da funcionalidade de refresh imediata aqui
  const columns = getUserColumns(null, { mutate: () => {} });

  if (isError) return <Alert severity="error">Erro ao carregar utilizadores: {error.message}</Alert>;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Utilizadores
      </Typography>

      <Paper variant="outlined" sx={{ p: 2 }}>
        {/* 3. AQUI ESTÁ O TRUQUE: Definir uma altura explícita */}
        <Box sx={{ height: 650, width: '100%' }}>
          <DataGrid
            // Garantir que acedes a data?.users e dás fallback para array vazio
            rows={data?.users || []}
            columns={columns}
            
            // Gestão do Estado de Carregamento e Total
            loading={isLoading}
            rowCount={data?.totalRows || 0}
            
            // Configuração para Server-Side Pagination/Sorting
            paginationMode="server"
            sortingMode="server"
            
            // Ligação aos estados locais
            paginationModel={paginationModel}
            onPaginationModelChange={setPaginationModel}
            sortModel={sortModel}
            onSortModelChange={setSortModel}
            pageSizeOptions={[10, 25, 50, 100]}
            
            // Extras
            slots={{ toolbar: GridToolbar }}
            density="compact"
            disableRowSelectionOnClick
            onRowClick={(params) => navigate(`/admin/users/${params.id}`)}
          />
        </Box>
      </Paper>
    </Box>
  );
};

export default AdminUsersPage;