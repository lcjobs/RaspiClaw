"""SSHTool -- SSH connection to remote devices (e.g. Raspberry Pi) via paramiko."""

from typing import Type, Optional
import time

from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field


class SSHConnectInput(BaseModel):
    hostname: str = Field(description="Remote device IP address or hostname")
    username: str = Field(description="SSH login username")
    password: str = Field(description="SSH login password")
    port: int = Field(default=22, description="SSH port, default 22")


class SSHCommandInput(BaseModel):
    command: str = Field(description="Shell command to execute on the remote device")


# Global SSH client cache
_ssh_clients: dict = {}


class SSHConnectTool(BaseTool):
    """Establish SSH connection to a remote device."""
    name: str = "ssh_connect"
    description: str = ""
    args_schema: Type[BaseModel] = SSHConnectInput

    def _run(self, hostname: str, username: str, password: str, port: int = 22) -> str:
        try:
            import paramiko
            ssh = paramiko.SSHClient()
            ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            ssh.connect(hostname=hostname, username=username, password=password, port=port, timeout=10)
            transport = ssh.get_transport()
            if transport:
                transport.set_keepalive(30)
            _ssh_clients[hostname] = ssh
            return f"SSH连接成功: {username}@{hostname}:{port}"
        except ImportError:
            return "paramiko 未安装。请运行: pip install paramiko"
        except Exception as e:
            return f"SSH连接失败: {str(e)}"


class SSHExecTool(BaseTool):
    """Execute a command on the connected remote device."""
    name: str = "ssh_exec"
    description: str = ""
    args_schema: Type[BaseModel] = SSHCommandInput

    def _run(self, command: str) -> str:
        if not _ssh_clients:
            return "未建立SSH连接。请先使用 ssh_connect 工具连接远程设备。"
        try:
            ssh = list(_ssh_clients.values())[-1]  # Use most recent connection
            stdin, stdout, stderr = ssh.exec_command(command, timeout=30)
            output = stdout.read().decode('utf-8', errors='replace')
            error = stderr.read().decode('utf-8', errors='replace')
            result = output
            if error:
                result += f"\n[stderr]\n{error}"
            return result.strip() or "(命令无输出)"
        except Exception as e:
            return f"命令执行失败: {str(e)}"


class SSHDisconnectTool(BaseTool):
    """Close all SSH connections."""
    name: str = "ssh_disconnect"
    description: str = ""
    args_schema: Type[BaseModel] = BaseModel

    def _run(self) -> str:
        count = 0
        for host, ssh in list(_ssh_clients.items()):
            try:
                ssh.close()
                count += 1
            except Exception:
                pass
        _ssh_clients.clear()
        return f"已关闭 {count} 个SSH连接"


def create_ssh_tools() -> list[BaseTool]:
    """Create all SSH tools."""
    connect = SSHConnectTool()
    connect.description = (
        "[SSH连接] 建立到远程设备（如树莓派）的SSH连接。"
        "需要参数: hostname(IP地址), username(用户名), password(密码), port(端口，默认22)。"
        "连接成功后，可使用 ssh_exec 执行远程命令。"
    )

    exec_cmd = SSHExecTool()
    exec_cmd.description = (
        "[SSH执行] 在已连接的远程设备上执行命令并返回结果。"
        "参数: command(要执行的shell命令)。"
        "使用前需先通过 ssh_connect 建立连接。"
    )

    disconnect = SSHDisconnectTool()
    disconnect.description = (
        "[SSH断开] 关闭所有活动的SSH连接。"
    )

    return [connect, exec_cmd, disconnect]
