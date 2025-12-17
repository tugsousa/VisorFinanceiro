import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Typography, Button } from '@mui/material';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import { useNavigate } from 'react-router-dom';
import RefreshIcon from '@mui/icons-material/Refresh';
import { apiFetchAdminUsers, apiRefreshMultipleUserMetrics } from '../api/adminApi';
import { getUserColumns } from '../config/adminGridConfig';

const AdminUsersPage = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 });
    const [selectedUserIds, setSelectedUserIds] = useState([]);

    const { data: usersData, isLoading } = useQuery({
        queryKey: ['adminUsers', paginationModel.page, paginationModel.pageSize],
        queryFn: () => apiFetchAdminUsers({ 
            page: paginationModel.page + 1, 
            limit: paginationModel.pageSize 
        }),
        keepPreviousData: true,
    });

    const refreshMetricsMutation = useMutation({
        mutationFn: apiRefreshMultipleUserMetrics,
        onSuccess: () => {
            queryClient.invalidateQueries(['adminUsers']);
            setSelectedUserIds([]);
        }
    });

    const columns = getUserColumns(navigate, (id) => console.log("Refresh single", id)); // Ajuste conforme a sua config

    return (
        <Box sx={{ height: 600, width: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h4">Gestão de Utilizadores</Typography>
                {selectedUserIds.length > 0 && (
                    <Button 
                        variant="contained" 
                        startIcon={<RefreshIcon />}
                        onClick={() => refreshMetricsMutation.mutate(selectedUserIds)}
                    >
                        Atualizar {selectedUserIds.length} Utilizadores
                    </Button>
                )}
            </Box>

            <DataGrid
                rows={usersData?.users || []}
                rowCount={usersData?.total || 0}
                columns={columns}
                loading={isLoading}
                paginationModel={paginationModel}
                onPaginationModelChange={setPaginationModel}
                pageSizeOptions={[25, 50, 100]}
                paginationMode="server"
                checkboxSelection
                onRowSelectionModelChange={(ids) => setSelectedUserIds(ids)}
                slots={{ toolbar: GridToolbar }}
                getRowId={(row) => row.id}
            />
        </Box>
    );
};

export default AdminUsersPage;