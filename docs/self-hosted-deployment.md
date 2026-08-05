# Master 自托管部署

本方案将 Master 运行在独立 Docker 容器中，使用 SQLite 持久化工作区；现有
`xuanshu.fun` 容器和数据不需要迁移。

## 1. 服务器准备

在服务器上创建一个共享 Docker 网络，并让现有 Nginx 容器加入该网络：

```bash
docker network create master_shared 2>/dev/null || true
docker network connect master_shared aliyun-nginx-1 2>/dev/null || true
```

确认网络中出现两个容器：

```bash
docker network inspect master_shared \
  --format '{{range .Containers}}{{.Name}}{{"\n"}}{{end}}'
```

## 2. 部署 Master 容器

推荐先使用 GitHub Actions 构建的镜像，避免在 2 核 2G 服务器上执行完整
前端构建。首次需要在服务器登录 GHCR，并将镜像地址写入环境变量：

```bash
echo "$GHCR_READ_TOKEN" | docker login ghcr.io -u Ment5981 --password-stdin
export MASTER_IMAGE=ghcr.io/ment5981/master-self-hosted:latest
```

如果暂时不使用镜像仓库，也可以将仓库放到服务器后在仓库根目录执行：

```bash
MASTER_IMAGE="$MASTER_IMAGE" docker compose -f deploy/self-hosted/docker-compose.yml pull
MASTER_IMAGE="$MASTER_IMAGE" docker compose -f deploy/self-hosted/docker-compose.yml up -d
docker compose -f deploy/self-hosted/docker-compose.yml ps
```

本地构建备用命令为：

```bash
docker compose -f deploy/self-hosted/docker-compose.yml up -d --build
```

先确认应用健康：

```bash
docker exec master-app node -e \
  "fetch('http://127.0.0.1:3000/api/health').then(async r => { console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1) }).catch(err => { console.error(err); process.exit(1) })"
```

SQLite 文件位于 Docker volume 的 `/data/master.sqlite`，不要删除
`master-data` volume。升级容器时只执行 `up -d`，不要执行 `down -v`。

如果旧版 D1 中已有工作区，先在旧版 Master 的“我的 → 导出数据”下载
`master-data.json`，新站启动后在“我的 → 导入数据”载入。载入后会通过当前
安装 ID 写入新的 SQLite 工作区；确认新站数据完整后再停止旧站访问。

## 3. 让 Nginx 按域名分流

现有配置文件位于：

```text
/root/xuanshu-divination/deploy/aliyun/nginx.conf
```

编辑前先备份：

```bash
cd /root/xuanshu-divination/deploy/aliyun
cp nginx.conf "nginx.conf.bak.$(date +%Y%m%d-%H%M%S)"
```

在现有 `http { ... }` 内增加一个新的 `server` 块。不要删除旧站的
`server` 块：

```nginx
server {
    listen 80;
    server_name master.xuanshu.fun;

    location / {
        proxy_pass http://master-app:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_read_timeout 120s;
    }
}
```

检查并重新加载：

```bash
docker exec aliyun-nginx-1 nginx -t
docker compose up -d nginx
curl -i http://master.xuanshu.fun/api/health
```

## 4. HTTPS

Android 配置关闭了明文 HTTP，因此正式使用前必须为
`master.xuanshu.fun` 配置证书。证书可以使用阿里云 SSL 证书服务或
Let's Encrypt。证书配置完成后，增加 `listen 443 ssl` 的 server 块，并将
80 端口重定向到 HTTPS；不要把证书私钥提交到 GitHub。

## 5. Android 地址

构建时可通过环境变量覆盖地址：

```bash
MASTER_CAPACITOR_SERVER_URL=https://master.xuanshu.fun npm run android:apk
```

当前仓库默认地址也已改为 `https://master.xuanshu.fun`。

## 6. 备份

建议每日备份 SQLite 文件：

```bash
docker run --rm \
  -v master-data:/data:ro \
  -v /root/master-backups:/backup \
  alpine:3.20 \
  sh -c 'cp /data/master.sqlite /backup/master-$(date +%F).sqlite'
```

恢复前先停止 Master 容器，并保留现有备份副本。
