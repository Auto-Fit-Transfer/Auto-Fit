select cron.schedule('autofit-chat-retention-30-days', '*/5 * * * *', 'set statement_timeout = ''60s''; select autofit_maintenance.purge_expired_chat_messages();');
