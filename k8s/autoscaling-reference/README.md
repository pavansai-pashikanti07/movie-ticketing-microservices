# ⚡ Enterprise Autoscaling Reference: AWS Karpenter (`k8s/autoscaling-reference/`)

> [!WARNING]
> **ARCHITECTURAL REFERENCE ONLY**: This directory is designed for **study, interview preparation, and architectural understanding**. 
> We **DO NOT** apply these manifests to our AWS Dev cluster so our monthly cloud bill remains strictly within the **AWS Free Tier (₹40–₹50 max)**.

---

## 1. Why Karpenter Exists (The Problem with Cluster Autoscaler)

In traditional Kubernetes on AWS, the standard scaling tool is **Cluster Autoscaler**. However, in a high-concurrency movie ticketing flash sale (e.g. *Salaar*, *Pushpa 2*, or *Kalki* booking launch), Cluster Autoscaler creates a major bottleneck:

```
[ Flash Sale Traffic: 10,000 req/s ]
                  │
                  ▼
[ HPA scales booking-service: 2 ➔ 10 Pods ]
                  │
                  ▼ (Node capacity full!)
[ 8 Pods in PENDING State ]
                  │
                  ▼
[ Traditional Cluster Autoscaler ]
   ├── Modifies AWS Auto Scaling Group (ASG) `desired_capacity`
   ├── Waits for AWS EC2 instance launch
   ├── Waits for OS boot, Kubelet start, and cluster join
   └── ⏱️ TOTAL DELAY: 2 to 4 MINUTES! (Flash sale is already ruined!)
```

---

## 2. How AWS Karpenter Solves This in Production (Just-In-Time Compute)

AWS Karpenter is an open-source, flexible, high-performance Kubernetes node autoscaler built by AWS.

### Key Advantages:
1. **Bypasses AWS Auto Scaling Groups (ASGs)**:
   - Karpenter talks directly to the **AWS EC2 Fleet API**. It does not need pre-configured ASGs.
2. **Lightning-Fast Node Launch (35–50 Seconds)**:
   - Instead of 3–4 minutes, a fresh EC2 Spot instance joins the cluster in under 1 minute.
3. **Bin-Packing Intelligence**:
   - Cluster Autoscaler only launches the single instance type configured in the ASG (e.g. `t3.medium`).
   - Karpenter inspects the pending pods' exact CPU, memory, and architecture requirements, and picks the most cost-effective Spot instance available from AWS (`c6i.xlarge`, `c6a.xlarge`, `m6i.large`).
4. **Aggressive Consolidation (FinOps)**:
   - As soon as the flash-sale burst ends and pods scale down, Karpenter consolidates remaining pods onto fewer nodes and terminates unneeded EC2 instances within **30 seconds**, saving up to **70% on AWS costs**.

---

## 3. Architecture Manifests in This Directory

- **[`karpenter-nodepool.yaml`](./karpenter-nodepool.yaml)**:
  - **`NodePool` (`cinepass-spot-nodepool`)**:
    - Selects instance categories `c` (compute-optimized for API processing) and `m`/`t` (general purpose).
    - Prioritizes Spot instances with automatic on-demand fallback.
    - Configures aggressive disruption policy: `consolidationPolicy: WhenEmptyOrUnderutilized` after 30 seconds.
  - **`EC2NodeClass` (`cinepass-node-class`)**:
    - Uses modern **Amazon Linux 2023 (`AL2023`)** for EKS 1.31.
    - Discovers VPC subnets and security groups automatically using cluster tags (`karpenter.sh/discovery: cinepass-dev-cluster`).
    - Configures encrypted 50Gi `gp3` root volumes (3,000 IOPS).

---

## 4. 🎯 How to Pitch This in an Interview (The Senior SRE Pitch)

> *"In our dev and testing environments, we deliberately ran EKS Managed Node Groups with Spot instances to maintain strict FinOps hygiene and keep our AWS costs within the Free Tier. However, for a tier-1 enterprise flash sale like BookMyShow, we designed a Karpenter v1 architecture. Traditional Cluster Autoscaler relies on Auto Scaling Groups, which introduces a 3-to-4 minute latency delay when spinning up nodes for pending pods. Karpenter calls the AWS EC2 Fleet API directly, provisioning right-sized Spot instances in under 45 seconds, and consolidates nodes within 30 seconds of traffic normalization to eliminate idle cloud waste."*
